#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <sys/stat.h>
#include <sys/ioctl.h>
#include <errno.h>
#include <pwd.h>
#include <unistd.h>

#include "utils.h"

#define DB_SUBPATH "/.local/share/todo"
#define DB_FILENAME "/todos.db"

char *get_db_path(void) {
    const char *home = getenv("HOME");
    if (!home) {
        struct passwd *pw = getpwuid(getuid());
        if (pw) {
            home = pw->pw_dir;
        }
    }

    if (!home) {
        fprintf(stderr, "Error: Could not determine home directory\n");
        return NULL;
    }

    size_t len = strlen(home) + strlen(DB_SUBPATH) + strlen(DB_FILENAME) + 1;
    char *path = malloc(len);
    if (!path) {
        fprintf(stderr, "Error: Memory allocation failed\n");
        return NULL;
    }

    snprintf(path, len, "%s%s%s", home, DB_SUBPATH, DB_FILENAME);
    return path;
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
    const char *p = str;

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
        } else {
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

void capitalize_first(char *str) {
    if (str && str[0]) {
        str[0] = toupper((unsigned char)str[0]);
    }
}
