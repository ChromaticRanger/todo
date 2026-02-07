#define _XOPEN_SOURCE 700
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <getopt.h>
#include <time.h>

#include "cli.h"
#include "db.h"
#include "todo.h"
#include "utils.h"

typedef enum {
    CMD_NONE,
    CMD_ADD,
    CMD_LIST,
    CMD_COMPLETE,
    CMD_DELETE,
    CMD_EDIT,
    CMD_SHOW,
    CMD_COMPLETED_SINCE,
    CMD_TODAY,
    CMD_WEEK,
    CMD_MONTH,
    CMD_SCHEDULE,
    CMD_HELP,
    CMD_CATEGORIES
} Command;

/* Store last command message for display in list */
static char last_command_msg[256] = "";

#define MAX_IDS 100

typedef struct {
    int ids[MAX_IDS];
    int count;
} IdList;

static struct option long_options[] = {
    {"add",             required_argument, 0, 'a'},
    {"list",            no_argument,       0, 'l'},
    {"complete",        required_argument, 0, 'C'},
    {"delete",          required_argument, 0, 'D'},
    {"edit",            required_argument, 0, 'e'},
    {"show",            required_argument, 0, 'S'},
    {"completed-since", required_argument, 0, 'R'},
    {"today",           no_argument,       0, 'T'},
    {"week",            no_argument,       0, 'W'},
    {"month",           no_argument,       0, 'M'},
    {"schedule",        no_argument,       0, 'E'},
    {"help",            no_argument,       0, 'h'},
    {"title",           required_argument, 0, 't'},
    {"description",     required_argument, 0, 'd'},
    {"category",        required_argument, 0, 'c'},
    {"priority",        required_argument, 0, 'p'},
    {"status",          required_argument, 0, 's'},
    {"due",             required_argument, 0, 'u'},
    {"repeat",          required_argument, 0, 'r'},
    {"cat",             no_argument,       0, 'A'},
    {0, 0, 0, 0}
};

static void cli_add(const char *title, const char *description,
                    const char *category, int priority, time_t due_date,
                    int repeat_days, int repeat_months);
static void cli_list(const char *category, int status);
static void spawn_repeating_todos(void);
static void cli_complete_multiple(const IdList *ids);
static void cli_delete_multiple(const IdList *ids);
static int parse_ids(const char *arg, IdList *list);
static void cli_edit(int id, const char *title, const char *description,
                     const char *category, int priority, time_t due_date);
static void cli_show(int id);
static void cli_completed_since(time_t since_date);
static void cli_due_range(int days);
static void cli_schedule(void);
static time_t parse_due_date(const char *date_str);
static void cli_categories(void);

void cli_help(const char *program_name) {
    printf("Usage: %s [COMMAND] [OPTIONS]\n\n", program_name);
    printf("A command-line todo application.\n\n");
    printf("Commands:\n");
    printf("  -a, --add TITLE        Add a new todo with the given title\n");
    printf("  -l, --list             List all todos\n");
    printf("  -C, --complete ID|[IDs]  Mark todo(s) as completed (e.g., -C 5 or -C [1,2,3])\n");
    printf("  -D, --delete ID|[IDs]  Delete todo(s) (e.g., -D 5 or -D [1,2,3])\n");
    printf("  -e, --edit ID          Edit an existing todo\n");
    printf("  -S, --show ID          Show details of a todo\n");
    printf("  -R, --completed-since DATE  List todos completed since DATE (YYYY-MM-DD)\n");
    printf("  -T, --today            List todos due today\n");
    printf("  -W, --week             List todos due within the next 7 days\n");
    printf("  -M, --month            List todos due within the next 31 days\n");
    printf("  -E, --schedule         List all scheduled todos by due date\n");
    printf("  -A, --cat              List all categories\n");
    printf("  -h, --help             Show this help message\n\n");
    printf("Options:\n");
    printf("  -t, --title TITLE      Set title (for edit)\n");
    printf("  -d, --description DESC Set description\n");
    printf("  -c, --category CAT     Set category (default: General)\n");
    printf("  -p, --priority 1-3     Set priority (1=low, 2=medium, 3=high)\n");
    printf("  -s, --status STATUS    Filter by status (pending, completed, all)\n");
    printf("  -u, --due DATE         Set due date (YYYY-MM-DD, YYYY-MM-DD HH:MM, or Nd/Nw/Nm/Ny)\n");
    printf("  -r, --repeat INTERVAL  Set repeat interval (e.g., 7d for 7 days, 2m for 2 months)\n\n");
    printf("Examples:\n");
    printf("  %s --add \"Buy groceries\" --category shopping --priority 2\n", program_name);
    printf("  %s --add \"Submit report\" --due 2025-01-25\n", program_name);
    printf("  %s --add \"Weekly review\" --due 2025-01-25 --repeat 7d\n", program_name);
    printf("  %s --list --category work --status pending\n", program_name);
    printf("  %s --complete 5\n", program_name);
    printf("  %s --edit 3 --title \"Updated title\" --priority 3\n", program_name);
    printf("  %s --completed-since 2025-01-01\n", program_name);
}

static void cli_categories(void) {
    CategoryList categories;
    int count = db_get_categories(&categories);

    if (count < 0) {
        fprintf(stderr, "Error: Failed to retrieve categories\n");
        return;
    }

    if (count == 0) {
        printf("No categories found.\n");
        return;
    }

    printf("Categories:\n");
    for (int i = 0; i < categories.count; i++) {
        printf("  %s\n", categories.categories[i]);
    }

    category_list_free(&categories);
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

    /* Try relative format: Nd, Nw, Nm, Ny */
    size_t len = strlen(date_str);
    if (len >= 2) {
        char unit = date_str[len - 1];
        if (unit == 'd' || unit == 'D' || unit == 'w' || unit == 'W' ||
            unit == 'm' || unit == 'M' || unit == 'y' || unit == 'Y') {
            char *endptr;
            long value = strtol(date_str, &endptr, 10);
            if (endptr == date_str + len - 1 && value > 0) {
                time_t now = time(NULL);
                struct tm *tm_info = localtime(&now);
                tm_info->tm_hour = 23;
                tm_info->tm_min = 59;
                tm_info->tm_sec = 59;
                tm_info->tm_isdst = -1;

                if (unit == 'd' || unit == 'D') {
                    tm_info->tm_mday += (int)value;
                } else if (unit == 'w' || unit == 'W') {
                    tm_info->tm_mday += (int)value * 7;
                } else if (unit == 'm' || unit == 'M') {
                    tm_info->tm_mon += (int)value;
                } else if (unit == 'y' || unit == 'Y') {
                    tm_info->tm_year += (int)value;
                }

                return mktime(tm_info);
            }
        }
    }

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

static int parse_repeat_interval(const char *str, int *days, int *months) {
    *days = 0;
    *months = 0;

    if (!str || strlen(str) < 2) return 0;

    size_t len = strlen(str);
    char unit = str[len - 1];

    /* Parse the numeric portion */
    char *endptr;
    long value = strtol(str, &endptr, 10);

    /* endptr should point to the unit character */
    if (endptr != str + len - 1 || value <= 0) {
        return 0;
    }

    if (unit == 'd' || unit == 'D') {
        if (value > 365) return 0;
        *days = (int)value;
        return 1;
    } else if (unit == 'm' || unit == 'M') {
        if (value > 12) return 0;
        *months = (int)value;
        return 1;
    }

    return 0;
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
    int repeat_days = 0;
    int repeat_months = 0;
    time_t since_date = 0;

    int opt;
    int option_index = 0;

    /* Reset getopt */
    optind = 1;

    while ((opt = getopt_long(argc, argv, "a:lC:D:e:S:R:TWMEhAt:d:c:p:s:u:r:",
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
            case 'R':
                cmd = CMD_COMPLETED_SINCE;
                since_date = parse_due_date(optarg);
                if (since_date == 0) {
                    fprintf(stderr, "Error: Invalid date format '%s'. Use YYYY-MM-DD\n", optarg);
                    return 1;
                }
                /* Set to start of day */
                struct tm *tm_since = localtime(&since_date);
                tm_since->tm_hour = 0;
                tm_since->tm_min = 0;
                tm_since->tm_sec = 0;
                since_date = mktime(tm_since);
                break;
            case 'T':
                cmd = CMD_TODAY;
                break;
            case 'W':
                cmd = CMD_WEEK;
                break;
            case 'M':
                cmd = CMD_MONTH;
                break;
            case 'E':
                cmd = CMD_SCHEDULE;
                break;
            case 'h':
                cmd = CMD_HELP;
                break;
            case 'A':
                cmd = CMD_CATEGORIES;
                break;
            case 't':
                edit_title = optarg;
                break;
            case 'd':
                description = optarg;
                break;
            case 'c':
                category = optarg;
                capitalize_first(category);
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
                    fprintf(stderr, "Error: Invalid date format '%s'. Use YYYY-MM-DD, YYYY-MM-DD HH:MM, or relative (e.g., 3d, 2w, 1m, 1y)\n", due_date_str);
                    return 1;
                }
                break;
            case 'r':
                if (!parse_repeat_interval(optarg, &repeat_days, &repeat_months)) {
                    fprintf(stderr, "Error: Invalid repeat format '%s'. Use format like '7d' for days or '2m' for months\n", optarg);
                    return 1;
                }
                break;
            case '?':
                return 1;
            default:
                break;
        }
    }

    /* If no command specified, show help */
    if (cmd == CMD_NONE) {
        cli_help(argv[0]);
        return 1;
    }

    switch (cmd) {
        case CMD_ADD:
            cli_add(add_title, description, category, priority, due_date, repeat_days, repeat_months);
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
        case CMD_COMPLETED_SINCE:
            cli_completed_since(since_date);
            break;
        case CMD_TODAY:
            cli_due_range(0);
            break;
        case CMD_WEEK:
            cli_due_range(7);
            break;
        case CMD_MONTH:
            cli_due_range(31);
            break;
        case CMD_SCHEDULE:
            cli_schedule();
            break;
        case CMD_HELP:
            cli_help(argv[0]);
            break;
        case CMD_CATEGORIES:
            cli_categories();
            break;
        default:
            cli_help(argv[0]);
            return 1;
    }

    /* Show updated list after modifying commands */
    if (cmd == CMD_ADD || cmd == CMD_COMPLETE || cmd == CMD_DELETE || cmd == CMD_EDIT) {
        cli_list(NULL, STATUS_ALL);
    }

    return 0;
}

static void cli_add(const char *title, const char *description,
                    const char *category, int priority, time_t due_date,
                    int repeat_days, int repeat_months) {
    if (!title || strlen(title) == 0) {
        fprintf(stderr, "Error: Title is required\n");
        return;
    }

    /* If repeat is set but no due date, use current time as base */
    time_t effective_due = due_date;
    if ((repeat_days > 0 || repeat_months > 0) && effective_due == 0) {
        effective_due = time(NULL);
    }

    int id = db_add_todo(title, description, category, priority, effective_due, repeat_days, repeat_months);
    if (id > 0) {
        if (repeat_days > 0) {
            snprintf(last_command_msg, sizeof(last_command_msg),
                     "Added repeating todo #%d (every %d day%s)", id, repeat_days, repeat_days == 1 ? "" : "s");
        } else if (repeat_months > 0) {
            snprintf(last_command_msg, sizeof(last_command_msg),
                     "Added repeating todo #%d (every %d month%s)", id, repeat_months, repeat_months == 1 ? "" : "s");
        } else {
            snprintf(last_command_msg, sizeof(last_command_msg), "Added todo #%d", id);
        }
    }
}

static time_t add_months(time_t base, int months) {
    struct tm *tm_info = localtime(&base);
    tm_info->tm_mon += months;
    tm_info->tm_isdst = -1;
    return mktime(tm_info);
}

static void spawn_repeating_todos(void) {
    TodoList spawn_list;
    int count = db_get_todos_needing_spawn(&spawn_list);

    if (count <= 0) {
        return;
    }

    for (int i = 0; i < spawn_list.count; i++) {
        Todo *todo = &spawn_list.items[i];
        time_t new_due;

        if (todo->repeat_days > 0) {
            /* Add days */
            new_due = todo->due_date + (todo->repeat_days * 24 * 60 * 60);
            /* If still in the past, keep adding until future */
            time_t now = time(NULL);
            while (new_due < now) {
                new_due += (todo->repeat_days * 24 * 60 * 60);
            }
        } else {
            /* Add months */
            new_due = add_months(todo->due_date, todo->repeat_months);
            /* If still in the past, keep adding until future */
            time_t now = time(NULL);
            while (new_due < now) {
                new_due = add_months(new_due, todo->repeat_months);
            }
        }

        /* Create new todo with same properties but new due date */
        int new_id = db_add_todo(
            todo->title,
            todo->description,
            todo->category,
            todo->priority,
            new_due,
            todo->repeat_days,
            todo->repeat_months
        );

        if (new_id > 0) {
            /* Mark the original as having spawned */
            db_mark_spawned(todo->id);
        }
    }

    todo_list_free(&spawn_list);
}

static void cli_list(const char *category, int status) {
    /* Check and spawn new occurrences of repeating todos */
    spawn_repeating_todos();

    TodoList list;
    TodoFilter filter = {
        .category = (char *)category,
        .status = status
    };
    char buffer[512];

    int count = db_get_todos(&list, &filter);
    if (count < 0) {
        fprintf(stderr, "Error: Failed to retrieve todos\n");
        return;
    }

    /* Build list of unique categories from the todos (excluding old completed items) */
    CategoryList categories;
    category_list_init(&categories);
    time_t one_day_ago = time(NULL) - (24 * 60 * 60);
    int display_count = 0;

    for (int i = 0; i < list.count; i++) {
        /* Skip completed items older than 1 day */
        if (list.items[i].status == STATUS_COMPLETED &&
            list.items[i].completed_at > 0 &&
            list.items[i].completed_at < one_day_ago) {
            continue;
        }
        display_count++;
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

    /* Clear terminal and add blank line */
    printf("\033[2J\033[3J\033[H\n");

    /* Print top border */
    print_border_top();
    print_border_empty();

    /* Print underlined heading */
    print_bordered("\033[4mTODO List\033[0m");
    print_border_empty();

    /* Show last command if set */
    if (last_command_msg[0] != '\0') {
        print_bordered(last_command_msg);
        print_border_empty();
        last_command_msg[0] = '\0';  /* Clear after displaying */
    }

    snprintf(buffer, sizeof(buffer), "%d todo(s) found.", display_count);
    print_bordered(buffer);
    print_border_empty();

    if (display_count == 0) {
        print_border_bottom();
        category_list_free(&categories);
        todo_list_free(&list);
        return;
    }

    /* Print "Upcoming" section for items due within 3 days */
    time_t now = time(NULL);
    time_t three_days = now + (3 * 24 * 60 * 60);
    int has_upcoming = 0;

    /* Check if there are any upcoming items */
    for (int i = 0; i < list.count; i++) {
        if (list.items[i].status == STATUS_PENDING &&
            list.items[i].due_date > now &&
            list.items[i].due_date <= three_days) {
            has_upcoming = 1;
            break;
        }
    }

    if (has_upcoming) {
        print_bordered("\033[4mUpcoming\033[0m");
        print_border_empty();

        for (int i = 0; i < list.count; i++) {
            if (list.items[i].status == STATUS_PENDING &&
                list.items[i].due_date > now &&
                list.items[i].due_date <= three_days) {
                char *display = todo_format_display_no_category(&list.items[i]);
                if (display) {
                    snprintf(buffer, sizeof(buffer), "\033[34m%s\033[0m", display);
                    print_bordered_wrapped(buffer, 76);
                    free(display);
                    /* Print due date underneath */
                    char due_buf[64];
                    struct tm *tm_info = localtime(&list.items[i].due_date);
                    strftime(due_buf, sizeof(due_buf), "%Y-%m-%d %H:%M", tm_info);
                    snprintf(buffer, sizeof(buffer), "\033[34mDue: %s\033[0m", due_buf);
                    print_bordered(buffer);
                    /* Check if more upcoming items follow */
                    int has_more = 0;
                    for (int j = i + 1; j < list.count && !has_more; j++) {
                        if (list.items[j].status == STATUS_PENDING &&
                            list.items[j].due_date > now &&
                            list.items[j].due_date <= three_days) {
                            has_more = 1;
                        }
                    }
                    if (has_more) {
                        print_border_empty();
                    }
                }
            }
        }
        print_border_empty();
    }

    /* Print todos grouped by category */
    for (int c = 0; c < categories.count; c++) {
        snprintf(buffer, sizeof(buffer), "\033[7m %s \033[0m", categories.categories[c]);
        print_bordered(buffer);
        print_border_empty();

        /* Print pending todos first */
        for (int i = 0; i < list.count; i++) {
            if (strcmp(list.items[i].category, categories.categories[c]) == 0 &&
                list.items[i].status == STATUS_PENDING) {
                char *display = todo_format_display_no_category(&list.items[i]);
                if (display) {
                    if (list.items[i].due_date > 0 && list.items[i].due_date < time(NULL)) {
                        snprintf(buffer, sizeof(buffer), "\033[31m%s\033[0m", display);
                    } else {
                        snprintf(buffer, sizeof(buffer), "%s", display);
                    }
                    print_bordered_wrapped(buffer, 76);
                    free(display);
                    /* Print due date underneath if set */
                    if (list.items[i].due_date > 0) {
                        char due_buf[64];
                        struct tm *tm_info = localtime(&list.items[i].due_date);
                        strftime(due_buf, sizeof(due_buf), "%Y-%m-%d %H:%M", tm_info);
                        snprintf(buffer, sizeof(buffer), "Due: %s", due_buf);
                        print_bordered(buffer);
                        /* Add extra newline only if not last item in category */
                        int has_more = 0;
                        for (int j = i + 1; j < list.count && !has_more; j++) {
                            if (strcmp(list.items[j].category, categories.categories[c]) == 0 &&
                                list.items[j].status == STATUS_PENDING) {
                                has_more = 1;
                            }
                        }
                        if (!has_more) {
                            for (int j = 0; j < list.count && !has_more; j++) {
                                if (strcmp(list.items[j].category, categories.categories[c]) == 0 &&
                                    list.items[j].status == STATUS_COMPLETED &&
                                    !(list.items[j].completed_at > 0 && list.items[j].completed_at < one_day_ago)) {
                                    has_more = 1;
                                }
                            }
                        }
                        if (has_more) {
                            print_border_empty();
                        }
                    }
                }
            }
        }
        /* Print completed todos at the end (only if completed within last day) */
        for (int i = 0; i < list.count; i++) {
            if (strcmp(list.items[i].category, categories.categories[c]) == 0 &&
                list.items[i].status == STATUS_COMPLETED) {
                /* Skip if completed more than 1 day ago */
                if (list.items[i].completed_at > 0 && list.items[i].completed_at < one_day_ago) {
                    continue;
                }
                char *display = todo_format_display_no_category(&list.items[i]);
                if (display) {
                    snprintf(buffer, sizeof(buffer), "\033[32m%s\033[0m", display);
                    print_bordered_wrapped(buffer, 76);
                    free(display);
                    /* Print due date underneath if set */
                    if (list.items[i].due_date > 0) {
                        char due_buf[64];
                        struct tm *tm_info = localtime(&list.items[i].due_date);
                        strftime(due_buf, sizeof(due_buf), "%Y-%m-%d %H:%M", tm_info);
                        snprintf(buffer, sizeof(buffer), "Due: %s", due_buf);
                        print_bordered(buffer);
                        /* Add extra newline only if not last item in category */
                        int has_more = 0;
                        for (int j = i + 1; j < list.count && !has_more; j++) {
                            if (strcmp(list.items[j].category, categories.categories[c]) == 0 &&
                                list.items[j].status == STATUS_COMPLETED &&
                                !(list.items[j].completed_at > 0 && list.items[j].completed_at < one_day_ago)) {
                                has_more = 1;
                            }
                        }
                        if (has_more) {
                            print_border_empty();
                        }
                    }
                }
            }
        }
        print_border_empty();
    }

    print_border_bottom();
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
            success_count++;
        } else {
            fail_count++;
        }
    }

    if (ids->count == 1 && success_count == 1) {
        snprintf(last_command_msg, sizeof(last_command_msg), "Completed todo #%d", ids->ids[0]);
    } else if (success_count > 0) {
        snprintf(last_command_msg, sizeof(last_command_msg), "Completed %d todo(s)", success_count);
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
            success_count++;
        } else {
            fail_count++;
        }
    }

    if (ids->count == 1 && success_count == 1) {
        snprintf(last_command_msg, sizeof(last_command_msg), "Deleted todo #%d", ids->ids[0]);
    } else if (success_count > 0) {
        snprintf(last_command_msg, sizeof(last_command_msg), "Deleted %d todo(s)", success_count);
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
        snprintf(last_command_msg, sizeof(last_command_msg), "Updated todo #%d", id);
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
    if (todo.repeat_days > 0) {
        printf("  Repeat:      Every %d day%s\n", todo.repeat_days, todo.repeat_days == 1 ? "" : "s");
    } else if (todo.repeat_months > 0) {
        printf("  Repeat:      Every %d month%s\n", todo.repeat_months, todo.repeat_months == 1 ? "" : "s");
    }
    printf("  Created:     %s\n", created_buf);
    if (todo.status == STATUS_COMPLETED) {
        printf("  Completed:   %s\n", completed_buf);
    }
    printf("\n");
}

static void cli_completed_since(time_t since_date) {
    TodoList list;
    char buffer[512];
    char date_buf[32];

    int count = db_get_completed_since(&list, since_date);
    if (count < 0) {
        fprintf(stderr, "Error: Failed to retrieve completed todos\n");
        return;
    }

    /* Format the since date for display */
    struct tm *tm_info = localtime(&since_date);
    strftime(date_buf, sizeof(date_buf), "%Y-%m-%d", tm_info);

    /* Clear terminal */
    printf("\033[2J\033[3J\033[H\n");

    /* Print bordered output */
    print_border_top();
    print_border_empty();

    snprintf(buffer, sizeof(buffer), "\033[4mCompleted Since %s\033[0m", date_buf);
    print_bordered(buffer);
    print_border_empty();

    snprintf(buffer, sizeof(buffer), "%d task(s) completed.", count);
    print_bordered(buffer);
    print_border_empty();

    if (count == 0) {
        print_border_bottom();
        todo_list_free(&list);
        return;
    }

    /* Group by category */
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
        snprintf(buffer, sizeof(buffer), "\033[7m %s \033[0m", categories.categories[c]);
        print_bordered(buffer);
        print_border_empty();

        for (int i = 0; i < list.count; i++) {
            if (strcmp(list.items[i].category, categories.categories[c]) == 0) {
                char *display = todo_format_display_no_category(&list.items[i]);
                if (display) {
                    snprintf(buffer, sizeof(buffer), "\033[32m%s\033[0m", display);
                    print_bordered_wrapped(buffer, 76);
                    free(display);

                    /* Print completed date */
                    if (list.items[i].completed_at > 0) {
                        char completed_buf[64];
                        struct tm *tm_completed = localtime(&list.items[i].completed_at);
                        strftime(completed_buf, sizeof(completed_buf), "%Y-%m-%d %H:%M", tm_completed);
                        snprintf(buffer, sizeof(buffer), "Completed: %s", completed_buf);
                        print_bordered(buffer);
                    }

                    /* Add spacing if not last in category */
                    int has_more = 0;
                    for (int j = i + 1; j < list.count && !has_more; j++) {
                        if (strcmp(list.items[j].category, categories.categories[c]) == 0) {
                            has_more = 1;
                        }
                    }
                    if (has_more) {
                        print_border_empty();
                    }
                }
            }
        }
        print_border_empty();
    }

    print_border_bottom();
    category_list_free(&categories);
    todo_list_free(&list);
}

static void cli_due_range(int days) {
    spawn_repeating_todos();

    char buffer[512];
    char date_buf[64];
    TodoList list;

    /* Calculate date range */
    time_t now = time(NULL);
    struct tm *tm_start = localtime(&now);
    tm_start->tm_hour = 0;
    tm_start->tm_min = 0;
    tm_start->tm_sec = 0;
    time_t start = mktime(tm_start);

    /* End of the range (end of day for 'days' days from now) */
    time_t end = start + ((days + 1) * 24 * 60 * 60) - 1;

    int count = db_get_todos_due_range(&list, start, end);
    if (count < 0) {
        fprintf(stderr, "Error: Failed to retrieve todos\n");
        return;
    }

    /* Determine title based on days */
    const char *title;
    if (days == 0) {
        title = "Due Today";
    } else if (days == 7) {
        title = "Due This Week";
    } else {
        title = "Due This Month";
    }

    /* Clear terminal */
    printf("\033[2J\033[3J\033[H\n");

    /* Print bordered output */
    print_border_top();
    print_border_empty();

    snprintf(buffer, sizeof(buffer), "\033[4m%s\033[0m", title);
    print_bordered(buffer);
    print_border_empty();

    snprintf(buffer, sizeof(buffer), "%d task(s) due.", count);
    print_bordered(buffer);
    print_border_empty();

    if (count == 0) {
        print_border_bottom();
        todo_list_free(&list);
        return;
    }

    /* Group by category */
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
        snprintf(buffer, sizeof(buffer), "\033[7m %s \033[0m", categories.categories[c]);
        print_bordered(buffer);
        print_border_empty();

        for (int i = 0; i < list.count; i++) {
            if (strcmp(list.items[i].category, categories.categories[c]) == 0) {
                char *display = todo_format_display_no_category(&list.items[i]);
                if (display) {
                    print_bordered_wrapped(display, 76);
                    free(display);

                    /* Print due date */
                    if (list.items[i].due_date > 0) {
                        struct tm *tm_due = localtime(&list.items[i].due_date);
                        strftime(date_buf, sizeof(date_buf), "%Y-%m-%d %H:%M", tm_due);
                        snprintf(buffer, sizeof(buffer), "Due: %s", date_buf);
                        print_bordered(buffer);
                    }

                    /* Add spacing if not last in category */
                    int has_more = 0;
                    for (int j = i + 1; j < list.count && !has_more; j++) {
                        if (strcmp(list.items[j].category, categories.categories[c]) == 0) {
                            has_more = 1;
                        }
                    }
                    if (has_more) {
                        print_border_empty();
                    }
                }
            }
        }
        print_border_empty();
    }

    print_border_bottom();
    category_list_free(&categories);
    todo_list_free(&list);
}

static void cli_schedule(void) {
    spawn_repeating_todos();

    char buffer[512];
    char date_buf[64];
    TodoList list;

    int count = db_get_todos_with_due_date(&list);
    if (count < 0) {
        fprintf(stderr, "Error: Failed to retrieve todos\n");
        return;
    }

    /* Clear terminal */
    printf("\033[2J\033[3J\033[H\n");

    /* Print bordered output */
    print_border_top();
    print_border_empty();

    print_bordered("\033[4mSchedule\033[0m");
    print_border_empty();

    snprintf(buffer, sizeof(buffer), "%d scheduled task(s).", count);
    print_bordered(buffer);
    print_border_empty();

    if (count == 0) {
        print_border_bottom();
        todo_list_free(&list);
        return;
    }

    /* Display items in chronological order */
    time_t now = time(NULL);
    for (int i = 0; i < list.count; i++) {
        char *display = todo_format_display_no_category(&list.items[i]);
        if (display) {
            /* Color red if overdue */
            if (list.items[i].due_date < now) {
                snprintf(buffer, sizeof(buffer), "\033[31m%s\033[0m", display);
                print_bordered_wrapped(buffer, 76);
            } else {
                print_bordered_wrapped(display, 76);
            }
            free(display);

            /* Print due date */
            struct tm *tm_due = localtime(&list.items[i].due_date);
            strftime(date_buf, sizeof(date_buf), "%Y-%m-%d %H:%M", tm_due);
            snprintf(buffer, sizeof(buffer), "Due: %s", date_buf);
            print_bordered(buffer);

            /* Add spacing if not last item */
            if (i < list.count - 1) {
                print_border_empty();
            }
        }
    }

    print_border_empty();
    print_border_bottom();
    todo_list_free(&list);
}
