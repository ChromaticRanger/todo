#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <libpq-fe.h>

#include "db.h"
#include "todo.h"

static PGconn *conn = NULL;
static char current_list[64] = "todos";

/* Populate a Todo struct from a PGresult row.
 * Expected column order: 0=id 1=title 2=description 3=category
 *   4=priority 5=status 6=created_at(epoch bigint) 7=completed_at(epoch bigint)
 *   8=due_date(bigint) 9=repeat_days 10=repeat_months 11=spawned_next */
static void row_to_todo(PGresult *res, int row, Todo *todo) {
    todo->id = atoi(PQgetvalue(res, row, 0));

    strncpy(todo->title, PQgetvalue(res, row, 1), TODO_TITLE_MAX - 1);
    todo->title[TODO_TITLE_MAX - 1] = '\0';

    if (!PQgetisnull(res, row, 2) && PQgetvalue(res, row, 2)[0]) {
        strncpy(todo->description, PQgetvalue(res, row, 2), TODO_DESC_MAX - 1);
        todo->description[TODO_DESC_MAX - 1] = '\0';
    } else {
        todo->description[0] = '\0';
    }

    if (!PQgetisnull(res, row, 3)) {
        strncpy(todo->category, PQgetvalue(res, row, 3), TODO_CATEGORY_MAX - 1);
        todo->category[TODO_CATEGORY_MAX - 1] = '\0';
    } else {
        strcpy(todo->category, "General");
    }

    todo->priority   = atoi(PQgetvalue(res, row, 4));
    todo->status     = atoi(PQgetvalue(res, row, 5));
    todo->created_at = PQgetisnull(res, row, 6) ? 0 : (time_t)atol(PQgetvalue(res, row, 6));
    todo->completed_at = PQgetisnull(res, row, 7) ? 0 : (time_t)atol(PQgetvalue(res, row, 7));
    todo->due_date   = PQgetisnull(res, row, 8) ? 0 : (time_t)atol(PQgetvalue(res, row, 8));
    todo->repeat_days   = PQgetisnull(res, row, 9)  ? 0 : atoi(PQgetvalue(res, row, 9));
    todo->repeat_months = PQgetisnull(res, row, 10) ? 0 : atoi(PQgetvalue(res, row, 10));
    todo->spawned_next  = PQgetisnull(res, row, 11) ? 0 : atoi(PQgetvalue(res, row, 11));
}

#define SELECT_COLS \
    "SELECT id, title, description, category, priority, status," \
    " EXTRACT(EPOCH FROM created_at)::BIGINT," \
    " EXTRACT(EPOCH FROM completed_at)::BIGINT," \
    " due_date, repeat_days, repeat_months, spawned_next FROM todos"

int db_init(const char *list_name) {
    /* Update active list name */
    if (list_name && list_name[0]) {
        strncpy(current_list, list_name, sizeof(current_list) - 1);
        current_list[sizeof(current_list) - 1] = '\0';
    } else if (!conn) {
        strcpy(current_list, "todos");
    }

    if (conn) {
        return 0; /* Already connected; list name updated above */
    }

    const char *db_url = getenv("DATABASE_URL");
    if (!db_url) {
        fprintf(stderr, "Error: DATABASE_URL environment variable is not set\n");
        return -1;
    }

    conn = PQconnectdb(db_url);
    if (PQstatus(conn) != CONNECTION_OK) {
        fprintf(stderr, "Error: Cannot connect to database: %s\n", PQerrorMessage(conn));
        PQfinish(conn);
        conn = NULL;
        return -1;
    }

    /* Suppress "relation already exists" notices on subsequent connections */
    PGresult *notice_res = PQexec(conn, "SET client_min_messages = WARNING");
    PQclear(notice_res);

    const char *create_sql =
        "CREATE TABLE IF NOT EXISTS todos ("
        "    id SERIAL PRIMARY KEY,"
        "    list_name TEXT NOT NULL DEFAULT 'todos',"
        "    title TEXT NOT NULL,"
        "    description TEXT,"
        "    category TEXT DEFAULT 'General',"
        "    priority INTEGER DEFAULT 2,"
        "    status INTEGER DEFAULT 0,"
        "    created_at TIMESTAMPTZ DEFAULT NOW(),"
        "    completed_at TIMESTAMPTZ,"
        "    due_date BIGINT,"
        "    repeat_days INTEGER DEFAULT 0,"
        "    repeat_months INTEGER DEFAULT 0,"
        "    spawned_next INTEGER DEFAULT 0"
        ");"
        "CREATE INDEX IF NOT EXISTS idx_list_name ON todos(list_name);"
        "CREATE INDEX IF NOT EXISTS idx_list_category ON todos(list_name, category);"
        "CREATE INDEX IF NOT EXISTS idx_list_status ON todos(list_name, status);";

    PGresult *res = PQexec(conn, create_sql);
    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "Error: Cannot create tables: %s\n", PQerrorMessage(conn));
        PQclear(res);
        PQfinish(conn);
        conn = NULL;
        return -1;
    }
    PQclear(res);
    return 0;
}

void db_close(void) {
    if (conn) {
        PQfinish(conn);
        conn = NULL;
    }
}

int db_add_todo(const char *title, const char *description,
                const char *category, int priority, time_t due_date,
                int repeat_days, int repeat_months) {
    if (!conn) return -1;

    char p_priority[16], p_repeat_days[16], p_repeat_months[16], p_due_date[32];
    snprintf(p_priority, sizeof(p_priority), "%d", priority > 0 ? priority : PRIORITY_MEDIUM);
    snprintf(p_repeat_days, sizeof(p_repeat_days), "%d", repeat_days > 0 ? repeat_days : 0);
    snprintf(p_repeat_months, sizeof(p_repeat_months), "%d", repeat_months > 0 ? repeat_months : 0);

    const char *due_date_param = NULL;
    if (due_date > 0) {
        snprintf(p_due_date, sizeof(p_due_date), "%ld", (long)due_date);
        due_date_param = p_due_date;
    }

    const char *paramValues[8] = {
        current_list,
        title,
        (description && description[0]) ? description : "",
        category ? category : "General",
        p_priority,
        due_date_param,
        p_repeat_days,
        p_repeat_months
    };

    PGresult *res = PQexecParams(conn,
        "INSERT INTO todos (list_name, title, description, category, priority,"
        " due_date, repeat_days, repeat_months)"
        " VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
        8, NULL, paramValues, NULL, NULL, 0);

    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Error: Failed to insert todo: %s\n", PQerrorMessage(conn));
        PQclear(res);
        return -1;
    }

    int new_id = atoi(PQgetvalue(res, 0, 0));
    PQclear(res);
    return new_id;
}

int db_add_todo_full(const Todo *todo) {
    if (!conn || !todo) return -1;

    char p_priority[16], p_status[16], p_created[32], p_completed[32];
    char p_due_date[32], p_repeat_days[16], p_repeat_months[16], p_spawned[16];

    snprintf(p_priority, sizeof(p_priority), "%d", todo->priority);
    snprintf(p_status, sizeof(p_status), "%d", todo->status);
    snprintf(p_created, sizeof(p_created), "%ld", (long)todo->created_at);
    snprintf(p_repeat_days, sizeof(p_repeat_days), "%d", todo->repeat_days);
    snprintf(p_repeat_months, sizeof(p_repeat_months), "%d", todo->repeat_months);
    snprintf(p_spawned, sizeof(p_spawned), "%d", todo->spawned_next);

    const char *completed_param = NULL;
    if (todo->completed_at > 0) {
        snprintf(p_completed, sizeof(p_completed), "%ld", (long)todo->completed_at);
        completed_param = p_completed;
    }

    const char *due_date_param = NULL;
    if (todo->due_date > 0) {
        snprintf(p_due_date, sizeof(p_due_date), "%ld", (long)todo->due_date);
        due_date_param = p_due_date;
    }

    const char *paramValues[12] = {
        current_list,
        todo->title,
        todo->description,
        todo->category,
        p_priority,
        p_status,
        p_created,
        completed_param,
        due_date_param,
        p_repeat_days,
        p_repeat_months,
        p_spawned
    };

    PGresult *res = PQexecParams(conn,
        "INSERT INTO todos (list_name, title, description, category, priority, status,"
        " created_at, completed_at, due_date, repeat_days, repeat_months, spawned_next)"
        " VALUES ($1, $2, $3, $4, $5, $6,"
        " to_timestamp($7::BIGINT), CASE WHEN $8 IS NOT NULL THEN to_timestamp($8::BIGINT) ELSE NULL END,"
        " $9, $10, $11, $12) RETURNING id",
        12, NULL, paramValues, NULL, NULL, 0);

    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Error: Failed to insert todo: %s\n", PQerrorMessage(conn));
        PQclear(res);
        return -1;
    }

    int new_id = atoi(PQgetvalue(res, 0, 0));
    PQclear(res);
    return new_id;
}

int db_get_todos(TodoList *list, const TodoFilter *filter) {
    if (!conn) return -1;

    todo_list_init(list);

    char sql[1024];
    const char *paramValues[3];
    int nparams = 1;
    char p_status[16];

    snprintf(sql, sizeof(sql),
        SELECT_COLS " WHERE list_name = $1");
    paramValues[0] = current_list;

    if (filter) {
        if (filter->category && filter->category[0]) {
            strncat(sql, " AND category = $2", sizeof(sql) - strlen(sql) - 1);
            paramValues[nparams++] = filter->category;
        }
        if (filter->status != STATUS_ALL) {
            char ph[24];
            snprintf(ph, sizeof(ph), " AND status = $%d", nparams + 1);
            strncat(sql, ph, sizeof(sql) - strlen(sql) - 1);
            snprintf(p_status, sizeof(p_status), "%d", filter->status);
            paramValues[nparams++] = p_status;
        }
    }

    strncat(sql, " ORDER BY priority DESC, created_at DESC", sizeof(sql) - strlen(sql) - 1);

    PGresult *res = PQexecParams(conn, sql, nparams, NULL, paramValues, NULL, NULL, 0);
    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Error: Failed to query todos: %s\n", PQerrorMessage(conn));
        PQclear(res);
        return -1;
    }

    int nrows = PQntuples(res);
    for (int i = 0; i < nrows; i++) {
        Todo todo;
        row_to_todo(res, i, &todo);
        if (todo_list_add(list, &todo) != 0) {
            PQclear(res);
            todo_list_free(list);
            return -1;
        }
    }

    PQclear(res);
    return list->count;
}

int db_get_todo_by_id(int id, Todo *todo) {
    if (!conn) return -1;

    char p_id[16];
    snprintf(p_id, sizeof(p_id), "%d", id);
    const char *paramValues[2] = { current_list, p_id };

    PGresult *res = PQexecParams(conn,
        SELECT_COLS " WHERE list_name = $1 AND id = $2",
        2, NULL, paramValues, NULL, NULL, 0);

    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Error: Failed to query todo: %s\n", PQerrorMessage(conn));
        PQclear(res);
        return -1;
    }

    if (PQntuples(res) == 0) {
        PQclear(res);
        return -1;
    }

    row_to_todo(res, 0, todo);
    PQclear(res);
    return 0;
}

int db_update_todo(int id, const char *title, const char *description,
                   const char *category, int priority, time_t due_date) {
    if (!conn) return -1;

    Todo current;
    if (db_get_todo_by_id(id, &current) != 0) {
        fprintf(stderr, "Error: Todo with ID %d not found\n", id);
        return -1;
    }

    char p_priority[16], p_id[16], p_due_date[32];
    const char *due_date_param = NULL;

    snprintf(p_priority, sizeof(p_priority), "%d", priority > 0 ? priority : current.priority);
    snprintf(p_id, sizeof(p_id), "%d", id);

    time_t effective_due = due_date > 0 ? due_date : current.due_date;
    if (effective_due > 0) {
        snprintf(p_due_date, sizeof(p_due_date), "%ld", (long)effective_due);
        due_date_param = p_due_date;
    }

    const char *paramValues[7] = {
        title ? title : current.title,
        description ? description : current.description,
        category ? category : current.category,
        p_priority,
        due_date_param,
        p_id,
        current_list
    };

    PGresult *res = PQexecParams(conn,
        "UPDATE todos SET title = $1, description = $2, category = $3,"
        " priority = $4, due_date = $5 WHERE id = $6 AND list_name = $7",
        7, NULL, paramValues, NULL, NULL, 0);

    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "Error: Failed to update todo: %s\n", PQerrorMessage(conn));
        PQclear(res);
        return -1;
    }

    PQclear(res);
    return 0;
}

int db_delete_todo(int id) {
    if (!conn) return -1;

    char p_id[16];
    snprintf(p_id, sizeof(p_id), "%d", id);
    const char *paramValues[2] = { p_id, current_list };

    PGresult *res = PQexecParams(conn,
        "DELETE FROM todos WHERE id = $1 AND list_name = $2",
        2, NULL, paramValues, NULL, NULL, 0);

    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "Error: Failed to delete todo: %s\n", PQerrorMessage(conn));
        PQclear(res);
        return -1;
    }

    int affected = atoi(PQcmdTuples(res));
    PQclear(res);

    if (affected == 0) {
        fprintf(stderr, "Error: Todo with ID %d not found\n", id);
        return -1;
    }

    return 0;
}

int db_complete_todo(int id) {
    if (!conn) return -1;

    char p_id[16];
    snprintf(p_id, sizeof(p_id), "%d", id);
    const char *paramValues[2] = { p_id, current_list };

    PGresult *res = PQexecParams(conn,
        "UPDATE todos SET status = 1, completed_at = NOW() WHERE id = $1 AND list_name = $2",
        2, NULL, paramValues, NULL, NULL, 0);

    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "Error: Failed to complete todo: %s\n", PQerrorMessage(conn));
        PQclear(res);
        return -1;
    }

    int affected = atoi(PQcmdTuples(res));
    PQclear(res);

    if (affected == 0) {
        fprintf(stderr, "Error: Todo with ID %d not found\n", id);
        return -1;
    }

    return 0;
}

int db_uncomplete_todo(int id) {
    if (!conn) return -1;

    char p_id[16];
    snprintf(p_id, sizeof(p_id), "%d", id);
    const char *paramValues[2] = { p_id, current_list };

    PGresult *res = PQexecParams(conn,
        "UPDATE todos SET status = 0, completed_at = NULL WHERE id = $1 AND list_name = $2",
        2, NULL, paramValues, NULL, NULL, 0);

    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "Error: Failed to uncomplete todo: %s\n", PQerrorMessage(conn));
        PQclear(res);
        return -1;
    }

    int affected = atoi(PQcmdTuples(res));
    PQclear(res);

    if (affected == 0) {
        fprintf(stderr, "Error: Todo with ID %d not found\n", id);
        return -1;
    }

    return 0;
}

int db_get_categories(CategoryList *list) {
    if (!conn) return -1;

    category_list_init(list);

    const char *paramValues[1] = { current_list };
    PGresult *res = PQexecParams(conn,
        "SELECT DISTINCT category FROM todos WHERE list_name = $1 ORDER BY category",
        1, NULL, paramValues, NULL, NULL, 0);

    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Error: Failed to query categories: %s\n", PQerrorMessage(conn));
        PQclear(res);
        return -1;
    }

    int nrows = PQntuples(res);
    for (int i = 0; i < nrows; i++) {
        const char *cat = PQgetvalue(res, i, 0);
        if (cat && category_list_add(list, cat) != 0) {
            PQclear(res);
            category_list_free(list);
            return -1;
        }
    }

    PQclear(res);
    return list->count;
}

int db_todo_exists(int id) {
    if (!conn) return 0;

    char p_id[16];
    snprintf(p_id, sizeof(p_id), "%d", id);
    const char *paramValues[2] = { current_list, p_id };

    PGresult *res = PQexecParams(conn,
        "SELECT 1 FROM todos WHERE list_name = $1 AND id = $2",
        2, NULL, paramValues, NULL, NULL, 0);

    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        PQclear(res);
        return 0;
    }

    int exists = (PQntuples(res) > 0);
    PQclear(res);
    return exists;
}

int db_mark_spawned(int id) {
    if (!conn) return -1;

    char p_id[16];
    snprintf(p_id, sizeof(p_id), "%d", id);
    const char *paramValues[2] = { p_id, current_list };

    PGresult *res = PQexecParams(conn,
        "UPDATE todos SET spawned_next = 1 WHERE id = $1 AND list_name = $2",
        2, NULL, paramValues, NULL, NULL, 0);

    int ok = (PQresultStatus(res) == PGRES_COMMAND_OK);
    PQclear(res);
    return ok ? 0 : -1;
}

int db_get_todos_needing_spawn(TodoList *list) {
    if (!conn) return -1;

    todo_list_init(list);

    char p_now[32];
    snprintf(p_now, sizeof(p_now), "%ld", (long)time(NULL));
    const char *paramValues[2] = { current_list, p_now };

    PGresult *res = PQexecParams(conn,
        SELECT_COLS
        " WHERE list_name = $1"
        " AND (repeat_days > 0 OR repeat_months > 0)"
        " AND due_date < $2"
        " AND spawned_next = 0 AND status = 0",
        2, NULL, paramValues, NULL, NULL, 0);

    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Error: Failed to query todos needing spawn: %s\n", PQerrorMessage(conn));
        PQclear(res);
        return -1;
    }

    int nrows = PQntuples(res);
    for (int i = 0; i < nrows; i++) {
        Todo todo;
        row_to_todo(res, i, &todo);
        if (todo_list_add(list, &todo) != 0) {
            PQclear(res);
            todo_list_free(list);
            return -1;
        }
    }

    PQclear(res);
    return list->count;
}

int db_get_completed_since(TodoList *list, time_t since_date) {
    if (!conn) return -1;

    todo_list_init(list);

    char p_since[32];
    snprintf(p_since, sizeof(p_since), "%ld", (long)since_date);
    const char *paramValues[2] = { current_list, p_since };

    PGresult *res = PQexecParams(conn,
        SELECT_COLS
        " WHERE list_name = $1 AND status = 1"
        " AND EXTRACT(EPOCH FROM completed_at)::BIGINT >= $2"
        " ORDER BY completed_at DESC",
        2, NULL, paramValues, NULL, NULL, 0);

    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Error: Failed to query completed todos: %s\n", PQerrorMessage(conn));
        PQclear(res);
        return -1;
    }

    int nrows = PQntuples(res);
    for (int i = 0; i < nrows; i++) {
        Todo todo;
        row_to_todo(res, i, &todo);
        if (todo_list_add(list, &todo) != 0) {
            PQclear(res);
            todo_list_free(list);
            return -1;
        }
    }

    PQclear(res);
    return list->count;
}

int db_get_todos_due_range(TodoList *list, time_t start, time_t end) {
    if (!conn) return -1;

    todo_list_init(list);

    char p_start[32], p_end[32];
    snprintf(p_start, sizeof(p_start), "%ld", (long)start);
    snprintf(p_end, sizeof(p_end), "%ld", (long)end);
    const char *paramValues[3] = { current_list, p_start, p_end };

    PGresult *res = PQexecParams(conn,
        SELECT_COLS
        " WHERE list_name = $1 AND status = 0"
        " AND due_date >= $2 AND due_date <= $3"
        " ORDER BY due_date ASC",
        3, NULL, paramValues, NULL, NULL, 0);

    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Error: Failed to query todos due in range: %s\n", PQerrorMessage(conn));
        PQclear(res);
        return -1;
    }

    int nrows = PQntuples(res);
    for (int i = 0; i < nrows; i++) {
        Todo todo;
        row_to_todo(res, i, &todo);
        if (todo_list_add(list, &todo) != 0) {
            PQclear(res);
            todo_list_free(list);
            return -1;
        }
    }

    PQclear(res);
    return list->count;
}

int db_get_todos_with_due_date(TodoList *list) {
    if (!conn) return -1;

    todo_list_init(list);

    const char *paramValues[1] = { current_list };

    PGresult *res = PQexecParams(conn,
        SELECT_COLS
        " WHERE list_name = $1 AND status = 0 AND due_date IS NOT NULL"
        " ORDER BY due_date ASC",
        1, NULL, paramValues, NULL, NULL, 0);

    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Error: Failed to query todos with due date: %s\n", PQerrorMessage(conn));
        PQclear(res);
        return -1;
    }

    int nrows = PQntuples(res);
    for (int i = 0; i < nrows; i++) {
        Todo todo;
        row_to_todo(res, i, &todo);
        if (todo_list_add(list, &todo) != 0) {
            PQclear(res);
            todo_list_free(list);
            return -1;
        }
    }

    PQclear(res);
    return list->count;
}

int db_get_available_lists(char ***names_out, int *count_out) {
    if (!conn) return -1;

    *names_out = NULL;
    *count_out = 0;

    PGresult *res = PQexec(conn,
        "SELECT DISTINCT list_name FROM todos ORDER BY list_name");

    if (PQresultStatus(res) != PGRES_TUPLES_OK) {
        fprintf(stderr, "Error: Failed to query lists: %s\n", PQerrorMessage(conn));
        PQclear(res);
        return -1;
    }

    int nrows = PQntuples(res);
    if (nrows == 0) {
        PQclear(res);
        return 0;
    }

    char **names = malloc(sizeof(char *) * nrows);
    if (!names) {
        PQclear(res);
        return -1;
    }

    for (int i = 0; i < nrows; i++) {
        names[i] = strdup(PQgetvalue(res, i, 0));
        if (!names[i]) {
            for (int j = 0; j < i; j++) free(names[j]);
            free(names);
            PQclear(res);
            return -1;
        }
    }

    PQclear(res);
    *names_out = names;
    *count_out = nrows;
    return nrows;
}

int db_move_todo(int id, const char *target_list) {
    if (!conn || !target_list) return -1;

    char p_id[16];
    snprintf(p_id, sizeof(p_id), "%d", id);
    const char *paramValues[3] = { target_list, p_id, current_list };

    PGresult *res = PQexecParams(conn,
        "UPDATE todos SET list_name = $1 WHERE id = $2 AND list_name = $3",
        3, NULL, paramValues, NULL, NULL, 0);

    if (PQresultStatus(res) != PGRES_COMMAND_OK) {
        fprintf(stderr, "Error: Failed to move todo: %s\n", PQerrorMessage(conn));
        PQclear(res);
        return -1;
    }

    int affected = atoi(PQcmdTuples(res));
    PQclear(res);
    return (affected > 0) ? 0 : -1;
}
