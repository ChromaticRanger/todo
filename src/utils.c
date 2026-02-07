#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <sys/stat.h>
#include <sys/ioctl.h>
#include <errno.h>
#include <pwd.h>
#include <unistd.h>
#include <dirent.h>

#include "utils.h"

#define DB_SUBPATH "/.local/share/todo"
#define DB_FILENAME "/todos.db"

static const char *get_home_dir(void) {
    const char *home = getenv("HOME");
    if (!home) {
        struct passwd *pw = getpwuid(getuid());
        if (pw) {
            home = pw->pw_dir;
        }
    }
    return home;
}

char *get_db_path(const char *list_name) {
    const char *home = get_home_dir();

    if (!home) {
        fprintf(stderr, "Error: Could not determine home directory\n");
        return NULL;
    }

    if (!list_name || list_name[0] == '\0') {
        /* Default: todos.db */
        size_t len = strlen(home) + strlen(DB_SUBPATH) + strlen(DB_FILENAME) + 1;
        char *path = malloc(len);
        if (!path) {
            fprintf(stderr, "Error: Memory allocation failed\n");
            return NULL;
        }
        snprintf(path, len, "%s%s%s", home, DB_SUBPATH, DB_FILENAME);
        return path;
    }

    /* Named list: <list_name>.db */
    size_t len = strlen(home) + strlen(DB_SUBPATH) + 1 + strlen(list_name) + 3 + 1;
    char *path = malloc(len);
    if (!path) {
        fprintf(stderr, "Error: Memory allocation failed\n");
        return NULL;
    }
    snprintf(path, len, "%s%s/%s.db", home, DB_SUBPATH, list_name);
    return path;
}

char **get_available_lists(int *count) {
    *count = 0;

    const char *home = get_home_dir();
    if (!home) return NULL;

    size_t dir_len = strlen(home) + strlen(DB_SUBPATH) + 1;
    char *dir_path = malloc(dir_len);
    if (!dir_path) return NULL;
    snprintf(dir_path, dir_len, "%s%s", home, DB_SUBPATH);

    DIR *dir = opendir(dir_path);
    free(dir_path);
    if (!dir) return NULL;

    /* First pass: count .db files */
    int capacity = 8;
    char **names = malloc(sizeof(char *) * capacity);
    if (!names) {
        closedir(dir);
        return NULL;
    }

    struct dirent *entry;
    while ((entry = readdir(dir)) != NULL) {
        const char *name = entry->d_name;
        size_t nlen = strlen(name);
        if (nlen > 3 && strcmp(name + nlen - 3, ".db") == 0) {
            /* Extract list name (strip .db) */
            char *list = strndup(name, nlen - 3);
            if (!list) continue;

            if (*count >= capacity) {
                capacity *= 2;
                char **tmp = realloc(names, sizeof(char *) * capacity);
                if (!tmp) {
                    free(list);
                    break;
                }
                names = tmp;
            }
            names[*count] = list;
            (*count)++;
        }
    }

    closedir(dir);
    return names;
}

void free_list_names(char **names, int count) {
    if (!names) return;
    for (int i = 0; i < count; i++) {
        free(names[i]);
    }
    free(names);
}

int ensure_directory(const char *path) {
    char *tmp = strdup(path);
    if (!tmp) {
        return -1;
    }

    char *p = tmp;

    /* Skip leading slash */
    if (*p == '/') {
        p++;
    }

    while (*p) {
        if (*p == '/') {
            *p = '\0';
            if (mkdir(tmp, 0755) != 0 && errno != EEXIST) {
                free(tmp);
                return -1;
            }
            *p = '/';
        }
        p++;
    }

    /* Create the final directory */
    if (mkdir(tmp, 0755) != 0 && errno != EEXIST) {
        free(tmp);
        return -1;
    }

    free(tmp);
    return 0;
}

void free_db_path(char *path) {
    free(path);
}

int get_terminal_width(void) {
    struct winsize ws;

    /* Try ioctl on stdout */
    if (ioctl(STDOUT_FILENO, TIOCGWINSZ, &ws) == 0 && ws.ws_col > 0) {
        return ws.ws_col;
    }

    /* Try ioctl on stderr (in case stdout is redirected) */
    if (ioctl(STDERR_FILENO, TIOCGWINSZ, &ws) == 0 && ws.ws_col > 0) {
        return ws.ws_col;
    }

    /* Fallback to COLUMNS environment variable */
    const char *cols = getenv("COLUMNS");
    if (cols) {
        int width = atoi(cols);
        if (width > 0) {
            return width;
        }
    }

    /* Default fallback */
    return 80;
}

size_t visible_strlen(const char *str) {
    if (!str) return 0;

    size_t len = 0;
    const unsigned char *p = (const unsigned char *)str;

    while (*p) {
        /* Check for ANSI escape sequence: ESC[ ... m */
        if (*p == '\033' && *(p + 1) == '[') {
            p += 2;  /* Skip ESC[ */
            /* Skip until we hit 'm' (end of SGR sequence) or end of string */
            while (*p && *p != 'm') {
                p++;
            }
            if (*p == 'm') {
                p++;  /* Skip the 'm' */
            }
        } else if ((*p & 0xC0) == 0x80) {
            /* UTF-8 continuation byte - skip without counting */
            p++;
        } else {
            /* ASCII or UTF-8 start byte - count as one character */
            len++;
            p++;
        }
    }

    return len;
}

void print_centered(const char *str) {
    if (!str) {
        printf("\n");
        return;
    }

    int term_width = get_terminal_width();
    size_t visible_len = visible_strlen(str);

    /* If string is wider than terminal, just print it normally */
    if (visible_len >= (size_t)term_width) {
        printf("%s\n", str);
        return;
    }

    /* Calculate left padding */
    int padding = (term_width - (int)visible_len) / 2;

    /* Print padding and string */
    printf("%*s%s\n", padding, "", str);
}

void print_centered_wrapped(const char *str, int max_width) {
    if (!str) {
        printf("\n");
        return;
    }

    int term_width = get_terminal_width();
    size_t total_visible_len = visible_strlen(str);

    /* If string fits within max_width, just center it normally */
    if (total_visible_len <= (size_t)max_width) {
        print_centered(str);
        return;
    }

    /* Extract any leading ANSI escape codes (e.g., color codes) */
    const char *p = str;
    const char *content_start = str;
    char prefix_codes[64] = "";
    size_t prefix_len = 0;

    while (*p == '\033' && *(p + 1) == '[') {
        const char *seq_start = p;
        p += 2;
        while (*p && *p != 'm') p++;
        if (*p == 'm') p++;
        size_t seq_len = p - seq_start;
        if (prefix_len + seq_len < sizeof(prefix_codes) - 1) {
            memcpy(prefix_codes + prefix_len, seq_start, seq_len);
            prefix_len += seq_len;
        }
        content_start = p;
    }
    prefix_codes[prefix_len] = '\0';

    /* Find trailing reset code if present */
    const char *suffix_codes = "\033[0m";
    size_t str_len = strlen(str);
    int has_reset = (str_len >= 4 && strcmp(str + str_len - 4, "\033[0m") == 0);
    if (!has_reset) {
        suffix_codes = "";
    }

    /* Calculate content end (excluding trailing reset) */
    const char *content_end = str + str_len;
    if (has_reset) {
        content_end -= 4;
    }

    /* Word wrap the content portion */
    const char *line_start = content_start;

    while (line_start < content_end) {
        const char *scan = line_start;
        const char *last_break = NULL;
        size_t line_visible_len = 0;

        /* Scan forward to find where to break */
        while (scan < content_end && line_visible_len < (size_t)max_width) {
            if (*scan == ' ') {
                last_break = scan;
            }
            /* Skip ANSI sequences when counting visible length */
            if (*scan == '\033' && *(scan + 1) == '[') {
                scan += 2;
                while (*scan && *scan != 'm') scan++;
                if (*scan == 'm') scan++;
            } else {
                line_visible_len++;
                scan++;
            }
        }

        const char *line_end;
        if (scan >= content_end) {
            /* Reached end of content */
            line_end = content_end;
        } else if (last_break && last_break > line_start) {
            /* Break at last space */
            line_end = last_break;
        } else {
            /* No space found, hard break at max_width */
            line_end = scan;
        }

        /* Build and print this line */
        size_t line_len = line_end - line_start;
        size_t buf_size = prefix_len + line_len + strlen(suffix_codes) + 1;
        char *line_buf = malloc(buf_size);
        if (line_buf) {
            size_t offset = 0;
            if (prefix_len > 0) {
                memcpy(line_buf, prefix_codes, prefix_len);
                offset = prefix_len;
            }
            memcpy(line_buf + offset, line_start, line_len);
            offset += line_len;
            strcpy(line_buf + offset, suffix_codes);

            /* Center this line */
            size_t vis_len = visible_strlen(line_buf);
            int padding = 0;
            if (vis_len < (size_t)term_width) {
                padding = (term_width - (int)vis_len) / 2;
            }
            printf("%*s%s\n", padding, "", line_buf);
            free(line_buf);
        }

        /* Move to next line, skipping the space if we broke on one */
        line_start = line_end;
        if (line_start < content_end && *line_start == ' ') {
            line_start++;
        }
    }
}

void capitalize_first(char *str) {
    if (str && str[0]) {
        str[0] = toupper((unsigned char)str[0]);
    }
}

int is_valid_list_name(const char *name) {
    if (!name || name[0] == '\0') return 0;

    size_t len = strlen(name);
    if (len > 63) return 0;

    /* Reject . and .. */
    if (strcmp(name, ".") == 0 || strcmp(name, "..") == 0) return 0;

    /* Only allow alphanumeric, hyphens, underscores */
    for (size_t i = 0; i < len; i++) {
        char c = name[i];
        if (!isalnum((unsigned char)c) && c != '-' && c != '_') return 0;
    }
    return 1;
}

#define BOX_WIDTH 80

static void print_box_line_centered(void) {
    int term_width = get_terminal_width();
    int padding = (term_width - BOX_WIDTH) / 2;
    if (padding < 0) padding = 0;
    printf("%*s", padding, "");
}

void print_border_top(void) {
    print_box_line_centered();
    printf("╭");
    for (int i = 0; i < BOX_WIDTH - 2; i++) {
        printf("─");
    }
    printf("╮\n");
}

void print_border_bottom(void) {
    print_box_line_centered();
    printf("╰");
    for (int i = 0; i < BOX_WIDTH - 2; i++) {
        printf("─");
    }
    printf("╯\n");
}

void print_border_empty(void) {
    print_box_line_centered();
    printf("│");
    printf("%*s", BOX_WIDTH - 2, "");
    printf("│\n");
}

void print_bordered(const char *str) {
    int term_width = get_terminal_width();
    int padding = (term_width - BOX_WIDTH) / 2;
    if (padding < 0) padding = 0;

    int content_width = BOX_WIDTH - 4;  /* 2 for borders, 2 for spacing */
    size_t visible_len = str ? visible_strlen(str) : 0;

    printf("%*s│ ", padding, "");

    if (!str || visible_len == 0) {
        printf("%*s", content_width, "");
    } else if (visible_len <= (size_t)content_width) {
        int left_pad = (content_width - (int)visible_len) / 2;
        int right_pad = content_width - (int)visible_len - left_pad;
        printf("%*s%s%*s", left_pad, "", str, right_pad, "");
    } else {
        /* String too long, print truncated */
        printf("%s", str);
    }

    printf(" │\n");
}

void print_bordered_wrapped(const char *str, int max_width) {
    if (!str) {
        print_border_empty();
        return;
    }

    int term_width = get_terminal_width();
    int box_padding = (term_width - BOX_WIDTH) / 2;
    if (box_padding < 0) box_padding = 0;

    int content_width = BOX_WIDTH - 4;  /* 2 for borders, 2 for spacing */
    int wrap_width = max_width < content_width ? max_width : content_width;

    size_t total_visible_len = visible_strlen(str);

    /* If string fits, just use print_bordered */
    if (total_visible_len <= (size_t)wrap_width) {
        print_bordered(str);
        return;
    }

    /* Extract any leading ANSI escape codes */
    const char *p = str;
    const char *content_start = str;
    char prefix_codes[64] = "";
    size_t prefix_len = 0;

    while (*p == '\033' && *(p + 1) == '[') {
        const char *seq_start = p;
        p += 2;
        while (*p && *p != 'm') p++;
        if (*p == 'm') p++;
        size_t seq_len = p - seq_start;
        if (prefix_len + seq_len < sizeof(prefix_codes) - 1) {
            memcpy(prefix_codes + prefix_len, seq_start, seq_len);
            prefix_len += seq_len;
        }
        content_start = p;
    }
    prefix_codes[prefix_len] = '\0';

    /* Find trailing reset code if present */
    const char *suffix_codes = "\033[0m";
    size_t str_len = strlen(str);
    int has_reset = (str_len >= 4 && strcmp(str + str_len - 4, "\033[0m") == 0);
    if (!has_reset) {
        suffix_codes = "";
    }

    /* Calculate content end */
    const char *content_end = str + str_len;
    if (has_reset) {
        content_end -= 4;
    }

    /* Word wrap the content */
    const char *line_start = content_start;

    while (line_start < content_end) {
        const char *scan = line_start;
        const char *last_break = NULL;
        size_t line_visible_len = 0;

        while (scan < content_end && line_visible_len < (size_t)wrap_width) {
            if (*scan == ' ') {
                last_break = scan;
            }
            if (*scan == '\033' && *(scan + 1) == '[') {
                scan += 2;
                while (*scan && *scan != 'm') scan++;
                if (*scan == 'm') scan++;
            } else {
                line_visible_len++;
                scan++;
            }
        }

        const char *line_end;
        if (scan >= content_end) {
            line_end = content_end;
        } else if (last_break && last_break > line_start) {
            line_end = last_break;
        } else {
            line_end = scan;
        }

        /* Build this line */
        size_t line_len = line_end - line_start;
        size_t buf_size = prefix_len + line_len + strlen(suffix_codes) + 1;
        char *line_buf = malloc(buf_size);
        if (line_buf) {
            size_t offset = 0;
            if (prefix_len > 0) {
                memcpy(line_buf, prefix_codes, prefix_len);
                offset = prefix_len;
            }
            memcpy(line_buf + offset, line_start, line_len);
            offset += line_len;
            strcpy(line_buf + offset, suffix_codes);

            print_bordered(line_buf);
            free(line_buf);
        }

        line_start = line_end;
        if (line_start < content_end && *line_start == ' ') {
            line_start++;
        }
    }
}
