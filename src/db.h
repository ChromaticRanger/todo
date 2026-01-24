#ifndef DB_H
#define DB_H

#include "todo.h"

/* Initialize the database connection and create tables if needed */
int db_init(void);

/* Close the database connection */
void db_close(void);

/* Add a new todo, returns the new ID or -1 on error */
int db_add_todo(const char *title, const char *description,
                const char *category, int priority, time_t due_date,
                int repeat_days, int repeat_months);

/* Get todos with optional filters, returns count or -1 on error */
int db_get_todos(TodoList *list, const TodoFilter *filter);

/* Get a single todo by ID, returns 0 on success, -1 on error */
int db_get_todo_by_id(int id, Todo *todo);

/* Update an existing todo, returns 0 on success, -1 on error */
int db_update_todo(int id, const char *title, const char *description,
                   const char *category, int priority, time_t due_date);

/* Delete a todo, returns 0 on success, -1 on error */
int db_delete_todo(int id);

/* Mark a todo as completed, returns 0 on success, -1 on error */
int db_complete_todo(int id);

/* Mark a todo as pending (uncomplete), returns 0 on success, -1 on error */
int db_uncomplete_todo(int id);

/* Get list of unique categories */
int db_get_categories(CategoryList *list);

/* Check if a todo with given ID exists */
int db_todo_exists(int id);

/* Mark a todo as having spawned its next occurrence */
int db_mark_spawned(int id);

/* Get repeating todos that need their next occurrence spawned */
int db_get_todos_needing_spawn(TodoList *list);

#endif /* DB_H */
