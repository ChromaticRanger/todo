#ifndef UTILS_H
#define UTILS_H

#include <stddef.h>

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

/* Validate a list name: alphanumeric, hyphens, underscores, max 63 chars. */
int is_valid_list_name(const char *name);

/* Escape a string for JSON output. Writes to dst (including NUL terminator). */
void json_escape(const char *src, char *dst, size_t dst_size);

#endif /* UTILS_H */
