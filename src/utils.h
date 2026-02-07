#ifndef UTILS_H
#define UTILS_H

#include <stddef.h>

/* Get the path to the database file.
 * If list_name is NULL or empty, returns ~/.local/share/todo/todos.db (default).
 * Otherwise returns ~/.local/share/todo/<list_name>.db */
char *get_db_path(const char *list_name);

/* Ensure a directory exists, creating it and parents if necessary */
int ensure_directory(const char *path);

/* Free a string allocated by get_db_path */
void free_db_path(char *path);

/* Get list of available todo list names (scans *.db in data directory).
 * Returns an array of strings terminated by NULL. Caller must free with free_list_names(). */
char **get_available_lists(int *count);

/* Free list returned by get_available_lists */
void free_list_names(char **names, int count);

/* Get terminal width in columns. Returns 80 if unable to determine. */
int get_terminal_width(void);

/* Calculate visible length of string (excluding ANSI escape sequences). */
size_t visible_strlen(const char *str);

/* Print a string centered in the terminal. */
void print_centered(const char *str);

/* Print a string centered in the terminal with word wrapping at max_width columns. */
void print_centered_wrapped(const char *str, int max_width);

/* Print a string centered within a bordered box. */
void print_bordered(const char *str);

/* Print a string centered within a bordered box with word wrapping. */
void print_bordered_wrapped(const char *str, int max_width);

/* Print the top border of the box. */
void print_border_top(void);

/* Print the bottom border of the box. */
void print_border_bottom(void);

/* Print an empty bordered line. */
void print_border_empty(void);

/* Capitalize the first letter of a string (modifies in place). */
void capitalize_first(char *str);

#endif /* UTILS_H */
