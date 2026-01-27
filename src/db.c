#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sqlite3.h>
#include <libgen.h>

#include "db.h"
#include "utils.h"

static sqlite3 *db = NULL;

static const char *CREATE_TABLE_SQL =
    "CREATE TABLE IF NOT EXISTS todos ("
    "    id INTEGER PRIMARY KEY AUTOINCREMENT,"
    "    title TEXT NOT NULL,"
    "    description TEXT,"
    "    category TEXT DEFAULT 'General',"
    "    priority INTEGER DEFAULT 2,"
    "    status INTEGER DEFAULT 0,"
    "    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,"
    "    completed_at TIMESTAMP,"
    "    due_date TIMESTAMP"
    ");"
    "CREATE INDEX IF NOT EXISTS idx_category ON todos(category);"
    "CREATE INDEX IF NOT EXISTS idx_status ON todos(status);";

int db_init(void) {
    if (db) {
        return 0; /* Already initialized */
    }

    char *db_path = get_db_path();
    if (!db_path) {
        return -1;
    }

    /* Ensure the directory exists */
    char *path_copy = strdup(db_path);
    if (!path_copy) {
        free_db_path(db_path);
        return -1;
    }
    char *dir = dirname(path_copy);
    if (ensure_directory(dir) != 0) {
        fprintf(stderr, "Error: Could not create database directory: %s\n", dir);
        free(path_copy);
        free_db_path(db_path);
        return -1;
    }
    free(path_copy);

    int rc = sqlite3_open(db_path, &db);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Error: Cannot open database: %s\n", sqlite3_errmsg(db));
        free_db_path(db_path);
        return -1;
    }
    free_db_path(db_path);

    /* Create tables */
    char *err_msg = NULL;
    rc = sqlite3_exec(db, CREATE_TABLE_SQL, NULL, NULL, &err_msg);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Error: Cannot create tables: %s\n", err_msg);
        sqlite3_free(err_msg);
        sqlite3_close(db);
        db = NULL;
        return -1;
    }

    /* Migration: Add repeat columns if they don't exist */
    sqlite3_exec(db, "ALTER TABLE todos ADD COLUMN repeat_days INTEGER DEFAULT 0", NULL, NULL, NULL);
    sqlite3_exec(db, "ALTER TABLE todos ADD COLUMN repeat_months INTEGER DEFAULT 0", NULL, NULL, NULL);
    sqlite3_exec(db, "ALTER TABLE todos ADD COLUMN spawned_next INTEGER DEFAULT 0", NULL, NULL, NULL);

    return 0;
}

void db_close(void) {
    if (db) {
        sqlite3_close(db);
        db = NULL;
    }
}

int db_add_todo(const char *title, const char *description,
                const char *category, int priority, time_t due_date,
                int repeat_days, int repeat_months) {
    if (!db) return -1;

    const char *sql = "INSERT INTO todos (title, description, category, priority, due_date, repeat_days, repeat_months) VALUES (?, ?, ?, ?, ?, ?, ?)";
    sqlite3_stmt *stmt;

    int rc = sqlite3_prepare_v2(db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Error: Failed to prepare statement: %s\n", sqlite3_errmsg(db));
        return -1;
    }

    sqlite3_bind_text(stmt, 1, title, -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 2, description ? description : "", -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 3, category ? category : "General", -1, SQLITE_STATIC);
    sqlite3_bind_int(stmt, 4, priority > 0 ? priority : PRIORITY_MEDIUM);
    if (due_date > 0) {
        sqlite3_bind_int64(stmt, 5, (sqlite3_int64)due_date);
    } else {
        sqlite3_bind_null(stmt, 5);
    }
    sqlite3_bind_int(stmt, 6, repeat_days > 0 ? repeat_days : 0);
    sqlite3_bind_int(stmt, 7, repeat_months > 0 ? repeat_months : 0);

    rc = sqlite3_step(stmt);
    if (rc != SQLITE_DONE) {
        fprintf(stderr, "Error: Failed to insert todo: %s\n", sqlite3_errmsg(db));
        sqlite3_finalize(stmt);
        return -1;
    }

    int new_id = (int)sqlite3_last_insert_rowid(db);
    sqlite3_finalize(stmt);
    return new_id;
}

int db_get_todos(TodoList *list, const TodoFilter *filter) {
    if (!db) return -1;

    todo_list_init(list);

    char sql[512];
    int has_where = 0;

    strcpy(sql, "SELECT id, title, description, category, priority, status, "
                "strftime('%s', created_at), strftime('%s', completed_at), due_date, "
                "repeat_days, repeat_months, spawned_next FROM todos");

    if (filter) {
        if (filter->category && strlen(filter->category) > 0) {
            strcat(sql, " WHERE category = ?");
            has_where = 1;
        }
        if (filter->status != STATUS_ALL) {
            strcat(sql, has_where ? " AND status = ?" : " WHERE status = ?");
            has_where = 1;
        }
    }

    strcat(sql, " ORDER BY priority DESC, created_at DESC");

    sqlite3_stmt *stmt;
    int rc = sqlite3_prepare_v2(db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Error: Failed to prepare statement: %s\n", sqlite3_errmsg(db));
        return -1;
    }

    int param_idx = 1;
    if (filter) {
        if (filter->category && strlen(filter->category) > 0) {
            sqlite3_bind_text(stmt, param_idx++, filter->category, -1, SQLITE_STATIC);
        }
        if (filter->status != STATUS_ALL) {
            sqlite3_bind_int(stmt, param_idx++, filter->status);
        }
    }

    while ((rc = sqlite3_step(stmt)) == SQLITE_ROW) {
        Todo todo;
        todo.id = sqlite3_column_int(stmt, 0);
        strncpy(todo.title, (const char *)sqlite3_column_text(stmt, 1), TODO_TITLE_MAX - 1);
        todo.title[TODO_TITLE_MAX - 1] = '\0';

        const char *desc = (const char *)sqlite3_column_text(stmt, 2);
        if (desc) {
            strncpy(todo.description, desc, TODO_DESC_MAX - 1);
            todo.description[TODO_DESC_MAX - 1] = '\0';
        } else {
            todo.description[0] = '\0';
        }

        const char *cat = (const char *)sqlite3_column_text(stmt, 3);
        if (cat) {
            strncpy(todo.category, cat, TODO_CATEGORY_MAX - 1);
            todo.category[TODO_CATEGORY_MAX - 1] = '\0';
        } else {
            strcpy(todo.category, "General");
        }

        todo.priority = sqlite3_column_int(stmt, 4);
        todo.status = sqlite3_column_int(stmt, 5);
        todo.created_at = (time_t)sqlite3_column_int64(stmt, 6);
        todo.completed_at = (time_t)sqlite3_column_int64(stmt, 7);
        todo.due_date = (time_t)sqlite3_column_int64(stmt, 8);
        todo.repeat_days = sqlite3_column_int(stmt, 9);
        todo.repeat_months = sqlite3_column_int(stmt, 10);
        todo.spawned_next = sqlite3_column_int(stmt, 11);

        if (todo_list_add(list, &todo) != 0) {
            sqlite3_finalize(stmt);
            todo_list_free(list);
            return -1;
        }
    }

    sqlite3_finalize(stmt);
    return list->count;
}

int db_get_todo_by_id(int id, Todo *todo) {
    if (!db) return -1;

    const char *sql = "SELECT id, title, description, category, priority, status, "
                      "strftime('%s', created_at), strftime('%s', completed_at), due_date, "
                      "repeat_days, repeat_months, spawned_next FROM todos WHERE id = ?";

    sqlite3_stmt *stmt;
    int rc = sqlite3_prepare_v2(db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Error: Failed to prepare statement: %s\n", sqlite3_errmsg(db));
        return -1;
    }

    sqlite3_bind_int(stmt, 1, id);

    rc = sqlite3_step(stmt);
    if (rc == SQLITE_ROW) {
        todo->id = sqlite3_column_int(stmt, 0);
        strncpy(todo->title, (const char *)sqlite3_column_text(stmt, 1), TODO_TITLE_MAX - 1);
        todo->title[TODO_TITLE_MAX - 1] = '\0';

        const char *desc = (const char *)sqlite3_column_text(stmt, 2);
        if (desc) {
            strncpy(todo->description, desc, TODO_DESC_MAX - 1);
            todo->description[TODO_DESC_MAX - 1] = '\0';
        } else {
            todo->description[0] = '\0';
        }

        const char *cat = (const char *)sqlite3_column_text(stmt, 3);
        if (cat) {
            strncpy(todo->category, cat, TODO_CATEGORY_MAX - 1);
            todo->category[TODO_CATEGORY_MAX - 1] = '\0';
        } else {
            strcpy(todo->category, "General");
        }

        todo->priority = sqlite3_column_int(stmt, 4);
        todo->status = sqlite3_column_int(stmt, 5);
        todo->created_at = (time_t)sqlite3_column_int64(stmt, 6);
        todo->completed_at = (time_t)sqlite3_column_int64(stmt, 7);
        todo->due_date = (time_t)sqlite3_column_int64(stmt, 8);
        todo->repeat_days = sqlite3_column_int(stmt, 9);
        todo->repeat_months = sqlite3_column_int(stmt, 10);
        todo->spawned_next = sqlite3_column_int(stmt, 11);

        sqlite3_finalize(stmt);
        return 0;
    }

    sqlite3_finalize(stmt);
    return -1;
}

int db_update_todo(int id, const char *title, const char *description,
                   const char *category, int priority, time_t due_date) {
    if (!db) return -1;

    /* First get the current todo to preserve unchanged fields */
    Todo current;
    if (db_get_todo_by_id(id, &current) != 0) {
        fprintf(stderr, "Error: Todo with ID %d not found\n", id);
        return -1;
    }

    const char *sql = "UPDATE todos SET title = ?, description = ?, category = ?, priority = ?, due_date = ? WHERE id = ?";
    sqlite3_stmt *stmt;

    int rc = sqlite3_prepare_v2(db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Error: Failed to prepare statement: %s\n", sqlite3_errmsg(db));
        return -1;
    }

    sqlite3_bind_text(stmt, 1, title ? title : current.title, -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 2, description ? description : current.description, -1, SQLITE_STATIC);
    sqlite3_bind_text(stmt, 3, category ? category : current.category, -1, SQLITE_STATIC);
    sqlite3_bind_int(stmt, 4, priority > 0 ? priority : current.priority);
    time_t effective_due = due_date > 0 ? due_date : current.due_date;
    if (effective_due > 0) {
        sqlite3_bind_int64(stmt, 5, (sqlite3_int64)effective_due);
    } else {
        sqlite3_bind_null(stmt, 5);
    }
    sqlite3_bind_int(stmt, 6, id);

    rc = sqlite3_step(stmt);
    if (rc != SQLITE_DONE) {
        fprintf(stderr, "Error: Failed to update todo: %s\n", sqlite3_errmsg(db));
        sqlite3_finalize(stmt);
        return -1;
    }

    sqlite3_finalize(stmt);
    return 0;
}

int db_delete_todo(int id) {
    if (!db) return -1;

    const char *sql = "DELETE FROM todos WHERE id = ?";
    sqlite3_stmt *stmt;

    int rc = sqlite3_prepare_v2(db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Error: Failed to prepare statement: %s\n", sqlite3_errmsg(db));
        return -1;
    }

    sqlite3_bind_int(stmt, 1, id);

    rc = sqlite3_step(stmt);
    if (rc != SQLITE_DONE) {
        fprintf(stderr, "Error: Failed to delete todo: %s\n", sqlite3_errmsg(db));
        sqlite3_finalize(stmt);
        return -1;
    }

    int changes = sqlite3_changes(db);
    sqlite3_finalize(stmt);

    if (changes == 0) {
        fprintf(stderr, "Error: Todo with ID %d not found\n", id);
        return -1;
    }

    return 0;
}

int db_complete_todo(int id) {
    if (!db) return -1;

    const char *sql = "UPDATE todos SET status = 1, completed_at = CURRENT_TIMESTAMP WHERE id = ?";
    sqlite3_stmt *stmt;

    int rc = sqlite3_prepare_v2(db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Error: Failed to prepare statement: %s\n", sqlite3_errmsg(db));
        return -1;
    }

    sqlite3_bind_int(stmt, 1, id);

    rc = sqlite3_step(stmt);
    if (rc != SQLITE_DONE) {
        fprintf(stderr, "Error: Failed to complete todo: %s\n", sqlite3_errmsg(db));
        sqlite3_finalize(stmt);
        return -1;
    }

    int changes = sqlite3_changes(db);
    sqlite3_finalize(stmt);

    if (changes == 0) {
        fprintf(stderr, "Error: Todo with ID %d not found\n", id);
        return -1;
    }

    return 0;
}

int db_uncomplete_todo(int id) {
    if (!db) return -1;

    const char *sql = "UPDATE todos SET status = 0, completed_at = NULL WHERE id = ?";
    sqlite3_stmt *stmt;

    int rc = sqlite3_prepare_v2(db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Error: Failed to prepare statement: %s\n", sqlite3_errmsg(db));
        return -1;
    }

    sqlite3_bind_int(stmt, 1, id);

    rc = sqlite3_step(stmt);
    if (rc != SQLITE_DONE) {
        fprintf(stderr, "Error: Failed to uncomplete todo: %s\n", sqlite3_errmsg(db));
        sqlite3_finalize(stmt);
        return -1;
    }

    int changes = sqlite3_changes(db);
    sqlite3_finalize(stmt);

    if (changes == 0) {
        fprintf(stderr, "Error: Todo with ID %d not found\n", id);
        return -1;
    }

    return 0;
}

int db_get_categories(CategoryList *list) {
    if (!db) return -1;

    category_list_init(list);

    const char *sql = "SELECT DISTINCT category FROM todos ORDER BY category";
    sqlite3_stmt *stmt;

    int rc = sqlite3_prepare_v2(db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Error: Failed to prepare statement: %s\n", sqlite3_errmsg(db));
        return -1;
    }

    while ((rc = sqlite3_step(stmt)) == SQLITE_ROW) {
        const char *cat = (const char *)sqlite3_column_text(stmt, 0);
        if (cat && category_list_add(list, cat) != 0) {
            sqlite3_finalize(stmt);
            category_list_free(list);
            return -1;
        }
    }

    sqlite3_finalize(stmt);
    return list->count;
}

int db_todo_exists(int id) {
    if (!db) return 0;

    const char *sql = "SELECT 1 FROM todos WHERE id = ?";
    sqlite3_stmt *stmt;

    int rc = sqlite3_prepare_v2(db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        return 0;
    }

    sqlite3_bind_int(stmt, 1, id);

    rc = sqlite3_step(stmt);
    int exists = (rc == SQLITE_ROW);

    sqlite3_finalize(stmt);
    return exists;
}

int db_mark_spawned(int id) {
    if (!db) return -1;

    const char *sql = "UPDATE todos SET spawned_next = 1 WHERE id = ?";
    sqlite3_stmt *stmt;

    int rc = sqlite3_prepare_v2(db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Error: Failed to prepare statement: %s\n", sqlite3_errmsg(db));
        return -1;
    }

    sqlite3_bind_int(stmt, 1, id);

    rc = sqlite3_step(stmt);
    sqlite3_finalize(stmt);

    return (rc == SQLITE_DONE) ? 0 : -1;
}

int db_get_todos_needing_spawn(TodoList *list) {
    if (!db) return -1;

    todo_list_init(list);

    /* Get repeating todos where due_date has passed, not yet spawned, and still pending */
    const char *sql = "SELECT id, title, description, category, priority, status, "
                      "strftime('%s', created_at), strftime('%s', completed_at), due_date, "
                      "repeat_days, repeat_months, spawned_next FROM todos "
                      "WHERE (repeat_days > 0 OR repeat_months > 0) AND due_date < ? "
                      "AND spawned_next = 0 AND status = 0";

    sqlite3_stmt *stmt;
    int rc = sqlite3_prepare_v2(db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Error: Failed to prepare statement: %s\n", sqlite3_errmsg(db));
        return -1;
    }

    sqlite3_bind_int64(stmt, 1, (sqlite3_int64)time(NULL));

    while ((rc = sqlite3_step(stmt)) == SQLITE_ROW) {
        Todo todo;
        todo.id = sqlite3_column_int(stmt, 0);
        strncpy(todo.title, (const char *)sqlite3_column_text(stmt, 1), TODO_TITLE_MAX - 1);
        todo.title[TODO_TITLE_MAX - 1] = '\0';

        const char *desc = (const char *)sqlite3_column_text(stmt, 2);
        if (desc) {
            strncpy(todo.description, desc, TODO_DESC_MAX - 1);
            todo.description[TODO_DESC_MAX - 1] = '\0';
        } else {
            todo.description[0] = '\0';
        }

        const char *cat = (const char *)sqlite3_column_text(stmt, 3);
        if (cat) {
            strncpy(todo.category, cat, TODO_CATEGORY_MAX - 1);
            todo.category[TODO_CATEGORY_MAX - 1] = '\0';
        } else {
            strcpy(todo.category, "General");
        }

        todo.priority = sqlite3_column_int(stmt, 4);
        todo.status = sqlite3_column_int(stmt, 5);
        todo.created_at = (time_t)sqlite3_column_int64(stmt, 6);
        todo.completed_at = (time_t)sqlite3_column_int64(stmt, 7);
        todo.due_date = (time_t)sqlite3_column_int64(stmt, 8);
        todo.repeat_days = sqlite3_column_int(stmt, 9);
        todo.repeat_months = sqlite3_column_int(stmt, 10);
        todo.spawned_next = sqlite3_column_int(stmt, 11);

        if (todo_list_add(list, &todo) != 0) {
            sqlite3_finalize(stmt);
            todo_list_free(list);
            return -1;
        }
    }

    sqlite3_finalize(stmt);
    return list->count;
}

int db_get_completed_since(TodoList *list, time_t since_date) {
    if (!db) return -1;

    todo_list_init(list);

    const char *sql = "SELECT id, title, description, category, priority, status, "
                      "strftime('%s', created_at), strftime('%s', completed_at), due_date, "
                      "repeat_days, repeat_months, spawned_next FROM todos "
                      "WHERE status = 1 AND strftime('%s', completed_at) >= ? "
                      "ORDER BY completed_at DESC";

    sqlite3_stmt *stmt;
    int rc = sqlite3_prepare_v2(db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Error: Failed to prepare statement: %s\n", sqlite3_errmsg(db));
        return -1;
    }

    sqlite3_bind_int64(stmt, 1, (sqlite3_int64)since_date);

    while ((rc = sqlite3_step(stmt)) == SQLITE_ROW) {
        Todo todo;
        todo.id = sqlite3_column_int(stmt, 0);
        strncpy(todo.title, (const char *)sqlite3_column_text(stmt, 1), TODO_TITLE_MAX - 1);
        todo.title[TODO_TITLE_MAX - 1] = '\0';

        const char *desc = (const char *)sqlite3_column_text(stmt, 2);
        if (desc) {
            strncpy(todo.description, desc, TODO_DESC_MAX - 1);
            todo.description[TODO_DESC_MAX - 1] = '\0';
        } else {
            todo.description[0] = '\0';
        }

        const char *cat = (const char *)sqlite3_column_text(stmt, 3);
        if (cat) {
            strncpy(todo.category, cat, TODO_CATEGORY_MAX - 1);
            todo.category[TODO_CATEGORY_MAX - 1] = '\0';
        } else {
            strcpy(todo.category, "General");
        }

        todo.priority = sqlite3_column_int(stmt, 4);
        todo.status = sqlite3_column_int(stmt, 5);
        todo.created_at = (time_t)sqlite3_column_int64(stmt, 6);
        todo.completed_at = (time_t)sqlite3_column_int64(stmt, 7);
        todo.due_date = (time_t)sqlite3_column_int64(stmt, 8);
        todo.repeat_days = sqlite3_column_int(stmt, 9);
        todo.repeat_months = sqlite3_column_int(stmt, 10);
        todo.spawned_next = sqlite3_column_int(stmt, 11);

        if (todo_list_add(list, &todo) != 0) {
            sqlite3_finalize(stmt);
            todo_list_free(list);
            return -1;
        }
    }

    sqlite3_finalize(stmt);
    return list->count;
}

int db_get_todos_due_range(TodoList *list, time_t start, time_t end) {
    if (!db) return -1;

    todo_list_init(list);

    const char *sql = "SELECT id, title, description, category, priority, status, "
                      "strftime('%s', created_at), strftime('%s', completed_at), due_date, "
                      "repeat_days, repeat_months, spawned_next FROM todos "
                      "WHERE status = 0 AND due_date >= ? AND due_date <= ? "
                      "ORDER BY due_date ASC";

    sqlite3_stmt *stmt;
    int rc = sqlite3_prepare_v2(db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Error: Failed to prepare statement: %s\n", sqlite3_errmsg(db));
        return -1;
    }

    sqlite3_bind_int64(stmt, 1, (sqlite3_int64)start);
    sqlite3_bind_int64(stmt, 2, (sqlite3_int64)end);

    while ((rc = sqlite3_step(stmt)) == SQLITE_ROW) {
        Todo todo;
        todo.id = sqlite3_column_int(stmt, 0);
        strncpy(todo.title, (const char *)sqlite3_column_text(stmt, 1), TODO_TITLE_MAX - 1);
        todo.title[TODO_TITLE_MAX - 1] = '\0';

        const char *desc = (const char *)sqlite3_column_text(stmt, 2);
        if (desc) {
            strncpy(todo.description, desc, TODO_DESC_MAX - 1);
            todo.description[TODO_DESC_MAX - 1] = '\0';
        } else {
            todo.description[0] = '\0';
        }

        const char *cat = (const char *)sqlite3_column_text(stmt, 3);
        if (cat) {
            strncpy(todo.category, cat, TODO_CATEGORY_MAX - 1);
            todo.category[TODO_CATEGORY_MAX - 1] = '\0';
        } else {
            strcpy(todo.category, "General");
        }

        todo.priority = sqlite3_column_int(stmt, 4);
        todo.status = sqlite3_column_int(stmt, 5);
        todo.created_at = (time_t)sqlite3_column_int64(stmt, 6);
        todo.completed_at = (time_t)sqlite3_column_int64(stmt, 7);
        todo.due_date = (time_t)sqlite3_column_int64(stmt, 8);
        todo.repeat_days = sqlite3_column_int(stmt, 9);
        todo.repeat_months = sqlite3_column_int(stmt, 10);
        todo.spawned_next = sqlite3_column_int(stmt, 11);

        if (todo_list_add(list, &todo) != 0) {
            sqlite3_finalize(stmt);
            todo_list_free(list);
            return -1;
        }
    }

    sqlite3_finalize(stmt);
    return list->count;
}

int db_get_todos_with_due_date(TodoList *list) {
    if (!db) return -1;

    todo_list_init(list);

    const char *sql = "SELECT id, title, description, category, priority, status, "
                      "strftime('%s', created_at), strftime('%s', completed_at), due_date, "
                      "repeat_days, repeat_months, spawned_next FROM todos "
                      "WHERE status = 0 AND due_date IS NOT NULL "
                      "ORDER BY due_date ASC";

    sqlite3_stmt *stmt;
    int rc = sqlite3_prepare_v2(db, sql, -1, &stmt, NULL);
    if (rc != SQLITE_OK) {
        fprintf(stderr, "Error: Failed to prepare statement: %s\n", sqlite3_errmsg(db));
        return -1;
    }

    while ((rc = sqlite3_step(stmt)) == SQLITE_ROW) {
        Todo todo;
        todo.id = sqlite3_column_int(stmt, 0);
        strncpy(todo.title, (const char *)sqlite3_column_text(stmt, 1), TODO_TITLE_MAX - 1);
        todo.title[TODO_TITLE_MAX - 1] = '\0';

        const char *desc = (const char *)sqlite3_column_text(stmt, 2);
        if (desc) {
            strncpy(todo.description, desc, TODO_DESC_MAX - 1);
            todo.description[TODO_DESC_MAX - 1] = '\0';
        } else {
            todo.description[0] = '\0';
        }

        const char *cat = (const char *)sqlite3_column_text(stmt, 3);
        if (cat) {
            strncpy(todo.category, cat, TODO_CATEGORY_MAX - 1);
            todo.category[TODO_CATEGORY_MAX - 1] = '\0';
        } else {
            strcpy(todo.category, "General");
        }

        todo.priority = sqlite3_column_int(stmt, 4);
        todo.status = sqlite3_column_int(stmt, 5);
        todo.created_at = (time_t)sqlite3_column_int64(stmt, 6);
        todo.completed_at = (time_t)sqlite3_column_int64(stmt, 7);
        todo.due_date = (time_t)sqlite3_column_int64(stmt, 8);
        todo.repeat_days = sqlite3_column_int(stmt, 9);
        todo.repeat_months = sqlite3_column_int(stmt, 10);
        todo.spawned_next = sqlite3_column_int(stmt, 11);

        if (todo_list_add(list, &todo) != 0) {
            sqlite3_finalize(stmt);
            todo_list_free(list);
            return -1;
        }
    }

    sqlite3_finalize(stmt);
    return list->count;
}
