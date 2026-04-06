#ifndef DB_H
#define DB_H

#include "todo.h"

/* Initialize the database connection and create tables if needed.
 * Reads DATABASE_URL from the environment. If list_name is non-NULL,
 * sets it as the active list; otherwise defaults to "todos". */
int db_init(const char *list_name);

/* Close the database connection */
void db_close(void);

/* Add a new todo, returns the new ID or -1 on error */
int db_add_todo(const char *title, const char *description,
                const char *category, int priority, time_t due_date,
                int repeat_days, int repeat_months);

/* Add a todo preserving all fields (for moving between lists).
 * Returns the new ID or -1 on error. */
int db_add_todo_full(const Todo *todo);

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

/* Get todos completed since a given date */
int db_get_completed_since(TodoList *list, time_t since_date);

/* Get pending todos with due dates in a given range */
int db_get_todos_due_range(TodoList *list, time_t start, time_t end);

/* Get all pending todos with due dates, sorted by due date ascending */
int db_get_todos_with_due_date(TodoList *list);

/* Get list of available todo list names from the database.
 * Allocates *names_out as an array of strdup'd strings; caller must free each entry and the array.
 * Returns count on success, -1 on error. */
int db_get_available_lists(char ***names_out, int *count_out);

/* Move a todo to a different list by updating its list_name.
 * Returns 0 on success, -1 if the todo was not found or on error. */
int db_move_todo(int id, const char *target_list);

#endif /* DB_H */
