#ifndef UTILS_H
#define UTILS_H

#include <stddef.h>

/* Get the path to the database file (~/.local/share/todo/todos.db) */
char *get_db_path(void);

/* Ensure a directory exists, creating it and parents if necessary */
int ensure_directory(const char *path);

/* Free a string allocated by get_db_path */
void free_db_path(char *path);

/* Get terminal width in columns. Returns 80 if unable to determine. */
int get_terminal_width(void);

/* Calculate visible length of string (excluding ANSI escape sequences). */
size_t visible_strlen(const char *str);

/* Print a string centered in the terminal. */
void print_centered(const char *str);

/* Capitalize the first letter of a string (modifies in place). */
void capitalize_first(char *str);

#endif /* UTILS_H */
