#ifndef UTILS_H
#define UTILS_H

/* Get the path to the database file (~/.local/share/todo/todos.db) */
char *get_db_path(void);

/* Ensure a directory exists, creating it and parents if necessary */
int ensure_directory(const char *path);

/* Free a string allocated by get_db_path */
void free_db_path(char *path);

#endif /* UTILS_H */
