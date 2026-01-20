#define _XOPEN_SOURCE 700
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <getopt.h>
#include <time.h>

#include "cli.h"
#include "db.h"
#include "todo.h"

typedef enum {
    CMD_NONE,
    CMD_ADD,
    CMD_LIST,
    CMD_COMPLETE,
    CMD_DELETE,
    CMD_EDIT,
    CMD_SHOW,
    CMD_TUI,
    CMD_HELP
} Command;

#define MAX_IDS 100

typedef struct {
    int ids[MAX_IDS];
    int count;
} IdList;

static struct option long_options[] = {
    {"add",         required_argument, 0, 'a'},
    {"list",        no_argument,       0, 'l'},
    {"complete",    required_argument, 0, 'C'},
    {"delete",      required_argument, 0, 'D'},
    {"edit",        required_argument, 0, 'e'},
    {"show",        required_argument, 0, 'S'},
    {"tui",         no_argument,       0, 'i'},
    {"help",        no_argument,       0, 'h'},
    {"title",       required_argument, 0, 't'},
    {"description", required_argument, 0, 'd'},
    {"category",    required_argument, 0, 'c'},
    {"priority",    required_argument, 0, 'p'},
    {"status",      required_argument, 0, 's'},
    {"due",         required_argument, 0, 'u'},
    {0, 0, 0, 0}
};

static void cli_add(const char *title, const char *description,
                    const char *category, int priority, time_t due_date);
static void cli_list(const char *category, int status);
static void cli_complete_multiple(const IdList *ids);
static void cli_delete_multiple(const IdList *ids);
static int parse_ids(const char *arg, IdList *list);
static void cli_edit(int id, const char *title, const char *description,
                     const char *category, int priority, time_t due_date);
static void cli_show(int id);
static time_t parse_due_date(const char *date_str);

void cli_help(const char *program_name) {
    printf("Usage: %s [COMMAND] [OPTIONS]\n\n", program_name);
    printf("A command-line todo application with TUI support.\n\n");
    printf("Commands:\n");
    printf("  -a, --add TITLE        Add a new todo with the given title\n");
    printf("  -l, --list             List all todos\n");
    printf("  -C, --complete ID|[IDs]  Mark todo(s) as completed (e.g., -C 5 or -C [1,2,3])\n");
    printf("  -D, --delete ID|[IDs]  Delete todo(s) (e.g., -D 5 or -D [1,2,3])\n");
    printf("  -e, --edit ID          Edit an existing todo\n");
    printf("  -S, --show ID          Show details of a todo\n");
    printf("  -i, --tui              Launch interactive TUI mode\n");
    printf("  -h, --help             Show this help message\n\n");
    printf("Options:\n");
    printf("  -t, --title TITLE      Set title (for edit)\n");
    printf("  -d, --description DESC Set description\n");
    printf("  -c, --category CAT     Set category (default: general)\n");
    printf("  -p, --priority 1-3     Set priority (1=low, 2=medium, 3=high)\n");
    printf("  -s, --status STATUS    Filter by status (pending, completed, all)\n");
    printf("  -u, --due DATE         Set due date (YYYY-MM-DD or YYYY-MM-DD HH:MM)\n\n");
    printf("Examples:\n");
    printf("  %s --add \"Buy groceries\" --category shopping --priority 2\n", program_name);
    printf("  %s --add \"Submit report\" --due 2025-01-25\n", program_name);
    printf("  %s --list --category work --status pending\n", program_name);
    printf("  %s --complete 5\n", program_name);
    printf("  %s --edit 3 --title \"Updated title\" --priority 3\n", program_name);
    printf("  %s           (launches TUI mode)\n", program_name);
}

static int parse_status(const char *status_str) {
    if (!status_str) return STATUS_ALL;
    if (strcmp(status_str, "pending") == 0) return STATUS_PENDING;
    if (strcmp(status_str, "completed") == 0) return STATUS_COMPLETED;
    if (strcmp(status_str, "all") == 0) return STATUS_ALL;
    fprintf(stderr, "Warning: Unknown status '%s', using 'all'\n", status_str);
    return STATUS_ALL;
}

static time_t parse_due_date(const char *date_str) {
    if (!date_str) return 0;

    struct tm tm_info = {0};
    tm_info.tm_isdst = -1;  /* Let system determine DST */

    /* Try YYYY-MM-DD HH:MM first */
    if (strptime(date_str, "%Y-%m-%d %H:%M", &tm_info) != NULL) {
        return mktime(&tm_info);
    }

    /* Try YYYY-MM-DD (set time to end of day) */
    memset(&tm_info, 0, sizeof(tm_info));
    tm_info.tm_isdst = -1;
    if (strptime(date_str, "%Y-%m-%d", &tm_info) != NULL) {
        tm_info.tm_hour = 23;
        tm_info.tm_min = 59;
        tm_info.tm_sec = 59;
        return mktime(&tm_info);
    }

    return 0;  /* Parse failed */
}

static int parse_ids(const char *arg, IdList *list) {
    list->count = 0;

    if (!arg || strlen(arg) == 0) {
        fprintf(stderr, "Error: No ID provided\n");
        return -1;
    }

    /* Check if it's bracket syntax */
    if (arg[0] == '[') {
        size_t len = strlen(arg);

        /* Must end with ']' */
        if (len < 3 || arg[len - 1] != ']') {
            fprintf(stderr, "Error: Invalid bracket syntax. Use [1,2,3]\n");
            return -1;
        }

        /* Create a mutable copy without brackets */
        char *copy = strndup(arg + 1, len - 2);
        if (!copy) {
            fprintf(stderr, "Error: Memory allocation failed\n");
            return -1;
        }

        /* Parse comma-separated IDs */
        char *token = strtok(copy, ",");
        while (token != NULL) {
            /* Skip leading whitespace */
            while (*token == ' ') token++;

            /* Trim trailing whitespace */
            char *end = token + strlen(token) - 1;
            while (end > token && *end == ' ') end--;
            *(end + 1) = '\0';

            if (strlen(token) == 0) {
                fprintf(stderr, "Error: Empty ID in list\n");
                free(copy);
                return -1;
            }

            /* Validate that token is a valid number */
            char *endptr;
            long val = strtol(token, &endptr, 10);
            if (*endptr != '\0' || val <= 0) {
                fprintf(stderr, "Error: Invalid ID '%s'\n", token);
                free(copy);
                return -1;
            }

            if (list->count >= MAX_IDS) {
                fprintf(stderr, "Error: Too many IDs (max %d)\n", MAX_IDS);
                free(copy);
                return -1;
            }

            list->ids[list->count++] = (int)val;
            token = strtok(NULL, ",");
        }

        free(copy);

        if (list->count == 0) {
            fprintf(stderr, "Error: No IDs provided in brackets\n");
            return -1;
        }

    } else {
        /* Single ID */
        char *endptr;
        long val = strtol(arg, &endptr, 10);
        if (*endptr != '\0' || val <= 0) {
            fprintf(stderr, "Error: Invalid ID '%s'\n", arg);
            return -1;
        }

        list->ids[0] = (int)val;
        list->count = 1;
    }

    return 0;
}

int cli_run(int argc, char *argv[]) {
    Command cmd = CMD_NONE;
    char *add_title = NULL;
    char *edit_title = NULL;
    char *description = NULL;
    char *category = NULL;
    char *status_str = NULL;
    char *due_date_str = NULL;
    int priority = 0;
    int target_id = 0;
    char *delete_arg = NULL;
    IdList delete_ids = {0};
    char *complete_arg = NULL;
    IdList complete_ids = {0};
    time_t due_date = 0;

    int opt;
    int option_index = 0;

    /* Reset getopt */
    optind = 1;

    while ((opt = getopt_long(argc, argv, "a:lC:D:e:S:iht:d:c:p:s:u:",
                              long_options, &option_index)) != -1) {
        switch (opt) {
            case 'a':
                cmd = CMD_ADD;
                add_title = optarg;
                break;
            case 'l':
                cmd = CMD_LIST;
                break;
            case 'C':
                cmd = CMD_COMPLETE;
                complete_arg = optarg;
                break;
            case 'D':
                cmd = CMD_DELETE;
                delete_arg = optarg;
                break;
            case 'e':
                cmd = CMD_EDIT;
                target_id = atoi(optarg);
                break;
            case 'S':
                cmd = CMD_SHOW;
                target_id = atoi(optarg);
                break;
            case 'i':
                cmd = CMD_TUI;
                break;
            case 'h':
                cmd = CMD_HELP;
                break;
            case 't':
                edit_title = optarg;
                break;
            case 'd':
                description = optarg;
                break;
            case 'c':
                category = optarg;
                break;
            case 'p':
                priority = atoi(optarg);
                if (priority < 1 || priority > 3) {
                    fprintf(stderr, "Error: Priority must be between 1 and 3\n");
                    return 1;
                }
                break;
            case 's':
                status_str = optarg;
                break;
            case 'u':
                due_date_str = optarg;
                due_date = parse_due_date(due_date_str);
                if (due_date == 0) {
                    fprintf(stderr, "Error: Invalid date format '%s'. Use YYYY-MM-DD or YYYY-MM-DD HH:MM\n", due_date_str);
                    return 1;
                }
                break;
            case '?':
                return 1;
            default:
                break;
        }
    }

    /* If no command specified and no args, return TUI mode indicator */
    if (cmd == CMD_NONE) {
        return -1; /* Signal to launch TUI */
    }

    switch (cmd) {
        case CMD_ADD:
            cli_add(add_title, description, category, priority, due_date);
            break;
        case CMD_LIST:
            cli_list(category, parse_status(status_str));
            break;
        case CMD_COMPLETE:
            if (parse_ids(complete_arg, &complete_ids) != 0) {
                return 1;
            }
            cli_complete_multiple(&complete_ids);
            break;
        case CMD_DELETE:
            if (parse_ids(delete_arg, &delete_ids) != 0) {
                return 1;
            }
            cli_delete_multiple(&delete_ids);
            break;
        case CMD_EDIT:
            cli_edit(target_id, edit_title, description, category, priority, due_date);
            break;
        case CMD_SHOW:
            cli_show(target_id);
            break;
        case CMD_TUI:
            return -1; /* Signal to launch TUI */
        case CMD_HELP:
            cli_help(argv[0]);
            break;
        default:
            cli_help(argv[0]);
            return 1;
    }

    return 0;
}

static void cli_add(const char *title, const char *description,
                    const char *category, int priority, time_t due_date) {
    if (!title || strlen(title) == 0) {
        fprintf(stderr, "Error: Title is required\n");
        return;
    }

    int id = db_add_todo(title, description, category, priority, due_date);
    if (id > 0) {
        printf("Added todo #%d: %s\n", id, title);
    }
}

static void cli_list(const char *category, int status) {
    TodoList list;
    TodoFilter filter = {
        .category = (char *)category,
        .status = status
    };

    int count = db_get_todos(&list, &filter);
    if (count < 0) {
        fprintf(stderr, "Error: Failed to retrieve todos\n");
        return;
    }

    if (count == 0) {
        printf("No todos found.\n");
        return;
    }

    /* Build list of unique categories from the todos */
    CategoryList categories;
    category_list_init(&categories);

    for (int i = 0; i < list.count; i++) {
        const char *cat = list.items[i].category;
        int found = 0;
        for (int j = 0; j < categories.count; j++) {
            if (strcmp(categories.categories[j], cat) == 0) {
                found = 1;
                break;
            }
        }
        if (!found) {
            category_list_add(&categories, cat);
        }
    }

    /* Print todos grouped by category */
    for (int c = 0; c < categories.count; c++) {
        printf("%s:\n\n", categories.categories[c]);

        /* Print pending todos first */
        for (int i = 0; i < list.count; i++) {
            if (strcmp(list.items[i].category, categories.categories[c]) == 0 &&
                list.items[i].status == STATUS_PENDING) {
                char *display = todo_format_display_no_category(&list.items[i]);
                if (display) {
                    if (list.items[i].due_date > 0 && list.items[i].due_date < time(NULL)) {
                        printf("  \033[31m%s\033[0m\n", display);  /* Red - overdue */
                    } else {
                        printf("  %s\n", display);
                    }
                    free(display);
                }
            }
        }
        /* Print completed todos at the end */
        for (int i = 0; i < list.count; i++) {
            if (strcmp(list.items[i].category, categories.categories[c]) == 0 &&
                list.items[i].status == STATUS_COMPLETED) {
                char *display = todo_format_display_no_category(&list.items[i]);
                if (display) {
                    printf("  \033[32m%s\033[0m\n", display);  /* Green */
                    free(display);
                }
            }
        }
        printf("\n");
    }

    printf("%d todo(s) found.\n", count);

    category_list_free(&categories);
    todo_list_free(&list);
}

static void cli_complete_multiple(const IdList *ids) {
    if (!ids || ids->count == 0) {
        fprintf(stderr, "Error: No todo IDs provided\n");
        return;
    }

    int success_count = 0;
    int fail_count = 0;

    for (int i = 0; i < ids->count; i++) {
        int id = ids->ids[i];

        if (id <= 0) {
            fprintf(stderr, "Error: Invalid todo ID %d\n", id);
            fail_count++;
            continue;
        }

        if (db_complete_todo(id) == 0) {
            printf("Marked todo #%d as completed.\n", id);
            success_count++;
        } else {
            fail_count++;
        }
    }

    if (ids->count > 1) {
        printf("\nSummary: %d completed, %d failed.\n", success_count, fail_count);
    }
}

static void cli_delete_multiple(const IdList *ids) {
    if (!ids || ids->count == 0) {
        fprintf(stderr, "Error: No todo IDs provided\n");
        return;
    }

    int success_count = 0;
    int fail_count = 0;

    for (int i = 0; i < ids->count; i++) {
        int id = ids->ids[i];

        if (id <= 0) {
            fprintf(stderr, "Error: Invalid todo ID %d\n", id);
            fail_count++;
            continue;
        }

        if (db_delete_todo(id) == 0) {
            printf("Deleted todo #%d.\n", id);
            success_count++;
        } else {
            fail_count++;
        }
    }

    if (ids->count > 1) {
        printf("\nSummary: %d deleted, %d failed.\n", success_count, fail_count);
    }
}

static void cli_edit(int id, const char *title, const char *description,
                     const char *category, int priority, time_t due_date) {
    if (id <= 0) {
        fprintf(stderr, "Error: Invalid todo ID\n");
        return;
    }

    if (!title && !description && !category && priority == 0 && due_date == 0) {
        fprintf(stderr, "Error: No fields to update. Use --title, --description, --category, --priority, or --due\n");
        return;
    }

    if (db_update_todo(id, title, description, category, priority, due_date) == 0) {
        printf("Updated todo #%d.\n", id);
    }
}

static void cli_show(int id) {
    if (id <= 0) {
        fprintf(stderr, "Error: Invalid todo ID\n");
        return;
    }

    Todo todo;
    if (db_get_todo_by_id(id, &todo) != 0) {
        fprintf(stderr, "Error: Todo #%d not found\n", id);
        return;
    }

    char created_buf[64] = "";
    char completed_buf[64] = "";
    char due_buf[64] = "";

    if (todo.created_at > 0) {
        struct tm *tm_info = localtime(&todo.created_at);
        strftime(created_buf, sizeof(created_buf), "%Y-%m-%d %H:%M:%S", tm_info);
    }

    if (todo.completed_at > 0) {
        struct tm *tm_info = localtime(&todo.completed_at);
        strftime(completed_buf, sizeof(completed_buf), "%Y-%m-%d %H:%M:%S", tm_info);
    }

    if (todo.due_date > 0) {
        struct tm *tm_info = localtime(&todo.due_date);
        strftime(due_buf, sizeof(due_buf), "%Y-%m-%d %H:%M:%S", tm_info);
    }

    printf("\n");
    printf("  ID:          %d\n", todo.id);
    printf("  Title:       %s\n", todo.title);
    printf("  Description: %s\n", strlen(todo.description) > 0 ? todo.description : "(none)");
    printf("  Category:    %s\n", todo.category);
    printf("  Priority:    %s\n", todo_priority_string(todo.priority));
    printf("  Status:      %s\n", todo_status_string(todo.status));
    if (todo.due_date > 0) {
        printf("  Due:         %s\n", due_buf);
    }
    printf("  Created:     %s\n", created_buf);
    if (todo.status == STATUS_COMPLETED) {
        printf("  Completed:   %s\n", completed_buf);
    }
    printf("\n");
}
