#ifndef TODO_H
#define TODO_H

#include <time.h>

#define TODO_TITLE_MAX 256
#define TODO_DESC_MAX 1024
#define TODO_CATEGORY_MAX 64

#define PRIORITY_LOW 1
#define PRIORITY_MEDIUM 2
#define PRIORITY_HIGH 3

#define STATUS_PENDING 0
#define STATUS_COMPLETED 1
#define STATUS_ALL -1

typedef struct {
    int id;
    char title[TODO_TITLE_MAX];
    char description[TODO_DESC_MAX];
    char category[TODO_CATEGORY_MAX];
    int priority;
    int status;
    time_t created_at;
    time_t completed_at;
    time_t due_date;
} Todo;

typedef struct {
    char *category;
    int status; /* -1=all, 0=pending, 1=completed */
} TodoFilter;

typedef struct {
    Todo *items;
    int count;
    int capacity;
} TodoList;

typedef struct {
    char **categories;
    int count;
} CategoryList;

/* Validate a todo item, returns 0 on success, -1 on error */
int todo_validate(const Todo *todo, char *error_buf, size_t error_buf_size);

/* Format todo for single-line display, returns allocated string */
char *todo_format_display(const Todo *todo);

/* Format todo without category (for grouped display), returns allocated string */
char *todo_format_display_no_category(const Todo *todo);

/* Get priority string representation */
const char *todo_priority_string(int priority);

/* Get priority short indicator [L], [M], [H] */
const char *todo_priority_indicator(int priority);

/* Get status string representation */
const char *todo_status_string(int status);

/* Get status indicator */
const char *todo_status_indicator(int status);

/* Initialize an empty todo list */
void todo_list_init(TodoList *list);

/* Free a todo list */
void todo_list_free(TodoList *list);

/* Add a todo to the list */
int todo_list_add(TodoList *list, const Todo *todo);

/* Initialize a category list */
void category_list_init(CategoryList *list);

/* Free a category list */
void category_list_free(CategoryList *list);

/* Add a category to the list */
int category_list_add(CategoryList *list, const char *category);

#endif /* TODO_H */
