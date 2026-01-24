#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "todo.h"

int todo_validate(const Todo *todo, char *error_buf, size_t error_buf_size) {
    if (!todo) {
        snprintf(error_buf, error_buf_size, "Todo is NULL");
        return -1;
    }

    if (strlen(todo->title) == 0) {
        snprintf(error_buf, error_buf_size, "Title is required");
        return -1;
    }

    if (strlen(todo->title) >= TODO_TITLE_MAX) {
        snprintf(error_buf, error_buf_size, "Title too long (max %d chars)", TODO_TITLE_MAX - 1);
        return -1;
    }

    if (todo->priority < PRIORITY_LOW || todo->priority > PRIORITY_HIGH) {
        snprintf(error_buf, error_buf_size, "Priority must be between %d and %d", PRIORITY_LOW, PRIORITY_HIGH);
        return -1;
    }

    if (todo->status != STATUS_PENDING && todo->status != STATUS_COMPLETED) {
        snprintf(error_buf, error_buf_size, "Status must be %d (pending) or %d (completed)", STATUS_PENDING, STATUS_COMPLETED);
        return -1;
    }

    return 0;
}

const char *todo_priority_string(int priority) {
    switch (priority) {
        case PRIORITY_LOW:    return "Low";
        case PRIORITY_MEDIUM: return "Medium";
        case PRIORITY_HIGH:   return "High";
        default:              return "Unknown";
    }
}

const char *todo_priority_indicator(int priority) {
    switch (priority) {
        case PRIORITY_LOW:    return "[L]";
        case PRIORITY_MEDIUM: return "[M]";
        case PRIORITY_HIGH:   return "[H]";
        default:              return "[?]";
    }
}

const char *todo_status_string(int status) {
    switch (status) {
        case STATUS_PENDING:   return "Pending";
        case STATUS_COMPLETED: return "Completed";
        default:               return "Unknown";
    }
}

const char *todo_status_indicator(int status) {
    switch (status) {
        case STATUS_PENDING:   return "[ ]";
        case STATUS_COMPLETED: return "[✓]";
        default:               return "[?]";
    }
}

char *todo_format_display(const Todo *todo) {
    /* Format: [ID] [Pri] category: title [status] */
    char *buf = malloc(512);
    if (!buf) return NULL;

    snprintf(buf, 512, "[%d] %s %s: %s %s",
             todo->id,
             todo_priority_indicator(todo->priority),
             todo->category,
             todo->title,
             todo_status_indicator(todo->status));

    return buf;
}

char *todo_format_display_no_category(const Todo *todo) {
    /* Format: [ID] [Pri] title * Xd/m * [status] (without category) */
    char *buf = malloc(512);
    if (!buf) return NULL;

    char repeat_indicator[32] = "";
    if (todo->repeat_days > 0) {
        snprintf(repeat_indicator, sizeof(repeat_indicator), " * %dd *", todo->repeat_days);
    } else if (todo->repeat_months > 0) {
        snprintf(repeat_indicator, sizeof(repeat_indicator), " * %dm *", todo->repeat_months);
    }

    snprintf(buf, 512, "[%d] %s %s%s %s",
             todo->id,
             todo_priority_indicator(todo->priority),
             todo->title,
             repeat_indicator,
             todo_status_indicator(todo->status));

    return buf;
}

void todo_list_init(TodoList *list) {
    list->items = NULL;
    list->count = 0;
    list->capacity = 0;
}

void todo_list_free(TodoList *list) {
    free(list->items);
    list->items = NULL;
    list->count = 0;
    list->capacity = 0;
}

int todo_list_add(TodoList *list, const Todo *todo) {
    if (list->count >= list->capacity) {
        int new_capacity = list->capacity == 0 ? 16 : list->capacity * 2;
        Todo *new_items = realloc(list->items, new_capacity * sizeof(Todo));
        if (!new_items) {
            return -1;
        }
        list->items = new_items;
        list->capacity = new_capacity;
    }

    list->items[list->count++] = *todo;
    return 0;
}

void category_list_init(CategoryList *list) {
    list->categories = NULL;
    list->count = 0;
}

void category_list_free(CategoryList *list) {
    for (int i = 0; i < list->count; i++) {
        free(list->categories[i]);
    }
    free(list->categories);
    list->categories = NULL;
    list->count = 0;
}

int category_list_add(CategoryList *list, const char *category) {
    char **new_cats = realloc(list->categories, (list->count + 1) * sizeof(char *));
    if (!new_cats) {
        return -1;
    }
    list->categories = new_cats;

    list->categories[list->count] = strdup(category);
    if (!list->categories[list->count]) {
        return -1;
    }

    list->count++;
    return 0;
}
