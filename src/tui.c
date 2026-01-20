#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <cdk/cdk.h>

#include "tui.h"
#include "db.h"
#include "todo.h"

static CDKSCREEN *cdkscreen = NULL;
static CDKSCROLL *todo_scroll = NULL;
static CDKLABEL *status_label = NULL;

static TodoList current_list;
static TodoFilter current_filter = { .category = NULL, .status = STATUS_ALL };
static char **list_items = NULL;
static int list_item_count = 0;

static void tui_cleanup(void);
static void tui_refresh_list(void);
static void tui_update_status(const char *message);
static void tui_add_dialog(void);
static void tui_edit_dialog(int index);
static void tui_view_dialog(int index);
static int tui_delete_confirm(int index);
static void tui_filter_dialog(void);
static void tui_toggle_complete(int index);
static void free_list_items(void);

static void free_list_items(void) {
    if (list_items) {
        for (int i = 0; i < list_item_count; i++) {
            free(list_items[i]);
        }
        free(list_items);
        list_items = NULL;
        list_item_count = 0;
    }
}

static void tui_cleanup(void) {
    free_list_items();
    todo_list_free(&current_list);

    if (todo_scroll) {
        destroyCDKScroll(todo_scroll);
        todo_scroll = NULL;
    }
    if (status_label) {
        destroyCDKLabel(status_label);
        status_label = NULL;
    }
    if (cdkscreen) {
        destroyCDKScreen(cdkscreen);
        cdkscreen = NULL;
    }
    endCDK();
}

static void tui_update_status(const char *message) {
    if (!status_label || !cdkscreen) return;

    char *status_text[1];
    char buf[256];
    snprintf(buf, sizeof(buf), "</B>%s<!B>", message);
    status_text[0] = buf;

    setCDKLabelMessage(status_label, (CDK_CSTRING2)status_text, 1);
    drawCDKLabel(status_label, TRUE);
}

static void tui_refresh_list(void) {
    todo_list_free(&current_list);
    free_list_items();

    int count = db_get_todos(&current_list, &current_filter);
    if (count < 0) {
        tui_update_status("Error loading todos");
        return;
    }

    list_items = malloc(sizeof(char *) * (count > 0 ? count : 1));
    if (!list_items) {
        tui_update_status("Memory error");
        return;
    }

    if (count == 0) {
        list_items[0] = strdup("  (No todos found - press 'a' to add one)");
        list_item_count = 1;
    } else {
        for (int i = 0; i < count; i++) {
            char buf[512];
            const Todo *t = &current_list.items[i];
            const char *pri_color = "";
            const char *status_mark = t->status == STATUS_COMPLETED ? "</B>[✓]<!B>" : "[ ]";

            switch (t->priority) {
                case PRIORITY_HIGH:   pri_color = "</R>"; break;
                case PRIORITY_MEDIUM: pri_color = "</Y>"; break;
                case PRIORITY_LOW:    pri_color = "</G>"; break;
            }

            snprintf(buf, sizeof(buf), " %3d  %s%s<!R><!Y><!G>  %-12.12s  %-35.35s  %s",
                     t->id,
                     pri_color,
                     todo_priority_indicator(t->priority),
                     t->category,
                     t->title,
                     status_mark);
            list_items[i] = strdup(buf);
        }
        list_item_count = count;
    }

    if (todo_scroll) {
        setCDKScrollItems(todo_scroll, (CDK_CSTRING2)list_items, list_item_count, FALSE);
        drawCDKScroll(todo_scroll, TRUE);
    }

    char status_msg[128];
    const char *filter_status = "All";
    if (current_filter.status == STATUS_PENDING) filter_status = "Pending";
    else if (current_filter.status == STATUS_COMPLETED) filter_status = "Completed";

    snprintf(status_msg, sizeof(status_msg), " %d todo(s) | Status: %s | Category: %s ",
             count, filter_status,
             current_filter.category ? current_filter.category : "All");
    tui_update_status(status_msg);
}

static void tui_add_dialog(void) {
    /* Title entry */
    CDKENTRY *title_entry = newCDKEntry(cdkscreen, CENTER, CENTER,
                                        "<C></B>Add New Todo<!B>",
                                        "Title: ", A_NORMAL, '_',
                                        vMIXED, 40, 0, 255, TRUE, FALSE);
    if (!title_entry) return;

    char *title = activateCDKEntry(title_entry, NULL);
    if (!title || strlen(title) == 0 || title_entry->exitType != vNORMAL) {
        destroyCDKEntry(title_entry);
        drawCDKScroll(todo_scroll, TRUE);
        return;
    }
    char *title_copy = strdup(title);
    destroyCDKEntry(title_entry);

    /* Description entry */
    CDKENTRY *desc_entry = newCDKEntry(cdkscreen, CENTER, CENTER,
                                       "<C></B>Add New Todo<!B>",
                                       "Description: ", A_NORMAL, '_',
                                       vMIXED, 40, 0, 1023, TRUE, FALSE);
    char *description = NULL;
    if (desc_entry) {
        char *desc = activateCDKEntry(desc_entry, NULL);
        if (desc && desc_entry->exitType == vNORMAL) {
            description = strdup(desc);
        }
        destroyCDKEntry(desc_entry);
    }

    /* Category entry */
    CDKENTRY *cat_entry = newCDKEntry(cdkscreen, CENTER, CENTER,
                                      "<C></B>Add New Todo<!B>",
                                      "Category: ", A_NORMAL, '_',
                                      vMIXED, 20, 0, 63, TRUE, FALSE);
    char *category = NULL;
    if (cat_entry) {
        setCDKEntryValue(cat_entry, "general");
        char *cat = activateCDKEntry(cat_entry, NULL);
        if (cat && cat_entry->exitType == vNORMAL) {
            category = strdup(cat);
        }
        destroyCDKEntry(cat_entry);
    }

    /* Priority selection */
    const char *priority_items[] = {"Low (1)", "Medium (2)", "High (3)"};
    CDKSCROLL *pri_scroll = newCDKScroll(cdkscreen, CENTER, CENTER, RIGHT,
                                         8, 25, "<C></B>Priority<!B>",
                                         (CDK_CSTRING2)priority_items, 3,
                                         FALSE, A_REVERSE, TRUE, FALSE);
    int priority = PRIORITY_MEDIUM;
    if (pri_scroll) {
        setCDKScrollCurrentItem(pri_scroll, 1); /* Default to medium */
        int sel = activateCDKScroll(pri_scroll, NULL);
        if (pri_scroll->exitType == vNORMAL) {
            priority = sel + 1;
        }
        destroyCDKScroll(pri_scroll);
    }

    /* Add the todo */
    int id = db_add_todo(title_copy, description, category, priority, 0);
    if (id > 0) {
        char msg[128];
        snprintf(msg, sizeof(msg), "Added todo #%d", id);
        tui_update_status(msg);
    }

    free(title_copy);
    free(description);
    free(category);

    tui_refresh_list();
}

static void tui_edit_dialog(int index) {
    if (index < 0 || index >= current_list.count) return;

    Todo *todo = &current_list.items[index];

    /* Title entry */
    CDKENTRY *title_entry = newCDKEntry(cdkscreen, CENTER, CENTER,
                                        "<C></B>Edit Todo<!B>",
                                        "Title: ", A_NORMAL, '_',
                                        vMIXED, 40, 0, 255, TRUE, FALSE);
    if (!title_entry) return;

    setCDKEntryValue(title_entry, todo->title);
    char *title = activateCDKEntry(title_entry, NULL);
    if (!title || title_entry->exitType != vNORMAL) {
        destroyCDKEntry(title_entry);
        drawCDKScroll(todo_scroll, TRUE);
        return;
    }
    char *title_copy = strdup(title);
    destroyCDKEntry(title_entry);

    /* Description entry */
    CDKENTRY *desc_entry = newCDKEntry(cdkscreen, CENTER, CENTER,
                                       "<C></B>Edit Todo<!B>",
                                       "Description: ", A_NORMAL, '_',
                                       vMIXED, 40, 0, 1023, TRUE, FALSE);
    char *description = NULL;
    if (desc_entry) {
        setCDKEntryValue(desc_entry, todo->description);
        char *desc = activateCDKEntry(desc_entry, NULL);
        if (desc && desc_entry->exitType == vNORMAL) {
            description = strdup(desc);
        }
        destroyCDKEntry(desc_entry);
    }

    /* Category entry */
    CDKENTRY *cat_entry = newCDKEntry(cdkscreen, CENTER, CENTER,
                                      "<C></B>Edit Todo<!B>",
                                      "Category: ", A_NORMAL, '_',
                                      vMIXED, 20, 0, 63, TRUE, FALSE);
    char *category = NULL;
    if (cat_entry) {
        setCDKEntryValue(cat_entry, todo->category);
        char *cat = activateCDKEntry(cat_entry, NULL);
        if (cat && cat_entry->exitType == vNORMAL) {
            category = strdup(cat);
        }
        destroyCDKEntry(cat_entry);
    }

    /* Priority selection */
    const char *priority_items[] = {"Low (1)", "Medium (2)", "High (3)"};
    CDKSCROLL *pri_scroll = newCDKScroll(cdkscreen, CENTER, CENTER, RIGHT,
                                         8, 25, "<C></B>Priority<!B>",
                                         (CDK_CSTRING2)priority_items, 3,
                                         FALSE, A_REVERSE, TRUE, FALSE);
    int priority = todo->priority;
    if (pri_scroll) {
        setCDKScrollCurrentItem(pri_scroll, todo->priority - 1);
        int sel = activateCDKScroll(pri_scroll, NULL);
        if (pri_scroll->exitType == vNORMAL) {
            priority = sel + 1;
        }
        destroyCDKScroll(pri_scroll);
    }

    /* Update the todo */
    if (db_update_todo(todo->id, title_copy, description, category, priority, 0) == 0) {
        tui_update_status("Todo updated");
    }

    free(title_copy);
    free(description);
    free(category);

    tui_refresh_list();
}

static void tui_view_dialog(int index) {
    if (index < 0 || index >= current_list.count) return;

    Todo *todo = &current_list.items[index];

    char created_buf[64] = "N/A";
    char completed_buf[64] = "N/A";

    if (todo->created_at > 0) {
        struct tm *tm_info = localtime(&todo->created_at);
        strftime(created_buf, sizeof(created_buf), "%Y-%m-%d %H:%M", tm_info);
    }

    if (todo->completed_at > 0) {
        struct tm *tm_info = localtime(&todo->completed_at);
        strftime(completed_buf, sizeof(completed_buf), "%Y-%m-%d %H:%M", tm_info);
    }

    char *message[10];
    char line1[128], line2[300], line3[128], line4[128], line5[128], line6[128], line7[128];

    snprintf(line1, sizeof(line1), "</B>ID:<!B>          %d", todo->id);
    snprintf(line2, sizeof(line2), "</B>Title:<!B>       %s", todo->title);
    snprintf(line3, sizeof(line3), "</B>Description:<!B> %.60s", strlen(todo->description) > 0 ? todo->description : "(none)");
    snprintf(line4, sizeof(line4), "</B>Category:<!B>    %s", todo->category);
    snprintf(line5, sizeof(line5), "</B>Priority:<!B>    %s", todo_priority_string(todo->priority));
    snprintf(line6, sizeof(line6), "</B>Status:<!B>      %s", todo_status_string(todo->status));
    snprintf(line7, sizeof(line7), "</B>Created:<!B>     %s", created_buf);

    message[0] = "";
    message[1] = line1;
    message[2] = line2;
    message[3] = line3;
    message[4] = line4;
    message[5] = line5;
    message[6] = line6;
    message[7] = line7;

    int msg_count = 8;
    char line8[128];
    if (todo->status == STATUS_COMPLETED) {
        snprintf(line8, sizeof(line8), "</B>Completed:<!B>   %s", completed_buf);
        message[8] = line8;
        msg_count = 9;
    }

    CDKDIALOG *dialog = newCDKDialog(cdkscreen, CENTER, CENTER,
                                     (CDK_CSTRING2)message, msg_count,
                                     (CDK_CSTRING2)(const char *[]){"  OK  "}, 1,
                                     A_REVERSE, TRUE, TRUE, FALSE);
    if (dialog) {
        activateCDKDialog(dialog, NULL);
        destroyCDKDialog(dialog);
    }

    drawCDKScroll(todo_scroll, TRUE);
}

static int tui_delete_confirm(int index) {
    if (index < 0 || index >= current_list.count) return 0;

    Todo *todo = &current_list.items[index];

    char *message[3];
    char msg_line[256];
    snprintf(msg_line, sizeof(msg_line), "Delete todo #%d: \"%.40s\"?", todo->id, todo->title);

    message[0] = "";
    message[1] = msg_line;
    message[2] = "";

    const char *buttons[] = {"  Cancel  ", "  Delete  "};

    CDKDIALOG *dialog = newCDKDialog(cdkscreen, CENTER, CENTER,
                                     (CDK_CSTRING2)message, 3,
                                     (CDK_CSTRING2)buttons, 2,
                                     A_REVERSE, TRUE, TRUE, FALSE);
    if (!dialog) return 0;

    int selection = activateCDKDialog(dialog, NULL);
    destroyCDKDialog(dialog);
    drawCDKScroll(todo_scroll, TRUE);

    if (selection == 1) { /* Delete selected */
        if (db_delete_todo(todo->id) == 0) {
            tui_update_status("Todo deleted");
            tui_refresh_list();
            return 1;
        }
    }

    return 0;
}

static void tui_filter_dialog(void) {
    /* Status filter */
    const char *status_items[] = {"All", "Pending", "Completed"};
    CDKSCROLL *status_scroll = newCDKScroll(cdkscreen, CENTER, CENTER, RIGHT,
                                            8, 20, "<C></B>Filter by Status<!B>",
                                            (CDK_CSTRING2)status_items, 3,
                                            FALSE, A_REVERSE, TRUE, FALSE);
    if (status_scroll) {
        int current_sel = 0;
        if (current_filter.status == STATUS_PENDING) current_sel = 1;
        else if (current_filter.status == STATUS_COMPLETED) current_sel = 2;
        setCDKScrollCurrentItem(status_scroll, current_sel);

        int sel = activateCDKScroll(status_scroll, NULL);
        if (status_scroll->exitType == vNORMAL) {
            switch (sel) {
                case 0: current_filter.status = STATUS_ALL; break;
                case 1: current_filter.status = STATUS_PENDING; break;
                case 2: current_filter.status = STATUS_COMPLETED; break;
            }
        }
        destroyCDKScroll(status_scroll);
    }

    /* Category filter */
    CategoryList categories;
    db_get_categories(&categories);

    int cat_count = categories.count + 1;
    char **cat_items = malloc(sizeof(char *) * cat_count);
    if (cat_items) {
        cat_items[0] = strdup("All Categories");
        for (int i = 0; i < categories.count; i++) {
            cat_items[i + 1] = strdup(categories.categories[i]);
        }

        CDKSCROLL *cat_scroll = newCDKScroll(cdkscreen, CENTER, CENTER, RIGHT,
                                             10, 25, "<C></B>Filter by Category<!B>",
                                             (CDK_CSTRING2)cat_items, cat_count,
                                             FALSE, A_REVERSE, TRUE, FALSE);
        if (cat_scroll) {
            int sel = activateCDKScroll(cat_scroll, NULL);
            if (cat_scroll->exitType == vNORMAL) {
                free(current_filter.category);
                if (sel == 0) {
                    current_filter.category = NULL;
                } else {
                    current_filter.category = strdup(categories.categories[sel - 1]);
                }
            }
            destroyCDKScroll(cat_scroll);
        }

        for (int i = 0; i < cat_count; i++) {
            free(cat_items[i]);
        }
        free(cat_items);
    }

    category_list_free(&categories);
    tui_refresh_list();
}

static void tui_toggle_complete(int index) {
    if (index < 0 || index >= current_list.count) return;

    Todo *todo = &current_list.items[index];

    if (todo->status == STATUS_COMPLETED) {
        if (db_uncomplete_todo(todo->id) == 0) {
            tui_update_status("Marked as pending");
        }
    } else {
        if (db_complete_todo(todo->id) == 0) {
            tui_update_status("Marked as completed");
        }
    }

    tui_refresh_list();
}

int tui_run(void) {
    WINDOW *cursesWin;

    /* Initialize curses */
    cursesWin = initscr();
    if (!cursesWin) {
        fprintf(stderr, "Error: Could not initialize ncurses\n");
        return 1;
    }

    /* Initialize CDK */
    cdkscreen = initCDKScreen(cursesWin);
    if (!cdkscreen) {
        endwin();
        fprintf(stderr, "Error: Could not initialize CDK\n");
        return 1;
    }

    initCDKColor();

    todo_list_init(&current_list);

    /* Create title */
    const char *title_msg[] = {"</B></U>Todo Manager<!U><!B>"};
    CDKLABEL *title_label = newCDKLabel(cdkscreen, CENTER, 0,
                                        (CDK_CSTRING2)title_msg, 1, FALSE, FALSE);

    /* Create help line */
    const char *help_msg[] = {"</B>[a]<!B>dd  </B>[e]<!B>dit  </B>[d]<!B>elete  </B>[c]<!B>omplete  </B>[v]<!B>iew  </B>[f]<!B>ilter  </B>[q]<!B>uit"};
    CDKLABEL *help_label = newCDKLabel(cdkscreen, CENTER, BOTTOM,
                                       (CDK_CSTRING2)help_msg, 1, FALSE, FALSE);

    /* Create status line */
    const char *status_msg[] = {" Loading... "};
    status_label = newCDKLabel(cdkscreen, CENTER, LINES - 3,
                               (CDK_CSTRING2)status_msg, 1, FALSE, FALSE);

    /* Create list header */
    const char *header_msg[] = {"</B>  ID   Pri   Category      Title                                Status<!B>"};
    CDKLABEL *header_label = newCDKLabel(cdkscreen, CENTER, 2,
                                         (CDK_CSTRING2)header_msg, 1, FALSE, FALSE);

    /* Create scroll list */
    const char *empty_list[] = {"  (Loading...)"};
    todo_scroll = newCDKScroll(cdkscreen, CENTER, 4, RIGHT,
                               LINES - 10, COLS - 4, NULL,
                               (CDK_CSTRING2)empty_list, 1,
                               FALSE, A_REVERSE, TRUE, FALSE);

    if (!todo_scroll) {
        tui_cleanup();
        fprintf(stderr, "Error: Could not create scroll widget\n");
        return 1;
    }

    /* Draw all widgets */
    drawCDKLabel(title_label, FALSE);
    drawCDKLabel(header_label, FALSE);
    drawCDKLabel(help_label, FALSE);
    drawCDKLabel(status_label, FALSE);

    /* Load initial data */
    tui_refresh_list();

    /* Main event loop */
    int running = 1;
    while (running) {
        int key = getch();

        switch (key) {
            case 'q':
            case 'Q':
                running = 0;
                break;

            case 'a':
            case 'A':
                tui_add_dialog();
                break;

            case 'e':
            case 'E':
                if (current_list.count > 0) {
                    int sel = getCDKScrollCurrentItem(todo_scroll);
                    tui_edit_dialog(sel);
                }
                break;

            case 'd':
            case 'D':
                if (current_list.count > 0) {
                    int sel = getCDKScrollCurrentItem(todo_scroll);
                    tui_delete_confirm(sel);
                }
                break;

            case 'c':
            case 'C':
                if (current_list.count > 0) {
                    int sel = getCDKScrollCurrentItem(todo_scroll);
                    tui_toggle_complete(sel);
                }
                break;

            case 'v':
            case 'V':
            case '\n':
            case KEY_ENTER:
                if (current_list.count > 0) {
                    int sel = getCDKScrollCurrentItem(todo_scroll);
                    tui_view_dialog(sel);
                }
                break;

            case 'f':
            case 'F':
                tui_filter_dialog();
                break;

            case KEY_UP:
            case 'k':
                if (current_list.count > 0) {
                    int current = getCDKScrollCurrentItem(todo_scroll);
                    if (current > 0) {
                        setCDKScrollCurrentItem(todo_scroll, current - 1);
                        drawCDKScroll(todo_scroll, TRUE);
                    }
                }
                break;

            case KEY_DOWN:
            case 'j':
                if (current_list.count > 0) {
                    int current = getCDKScrollCurrentItem(todo_scroll);
                    if (current < current_list.count - 1) {
                        setCDKScrollCurrentItem(todo_scroll, current + 1);
                        drawCDKScroll(todo_scroll, TRUE);
                    }
                }
                break;

            case 'r':
            case 'R':
                tui_refresh_list();
                break;

            default:
                break;
        }
    }

    /* Cleanup */
    destroyCDKLabel(title_label);
    destroyCDKLabel(header_label);
    destroyCDKLabel(help_label);
    free(current_filter.category);
    tui_cleanup();

    return 0;
}
