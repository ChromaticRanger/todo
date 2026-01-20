#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
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
