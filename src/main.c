#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <signal.h>

#include "db.h"
#include "cli.h"
#include "utils.h"

static void cleanup(void) {
    db_close();
}

static void signal_handler(int sig) {
    (void)sig;
    cleanup();
    exit(1);
}

static int is_valid_list_name(const char *name) {
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

int main(int argc, char *argv[]) {
    /* Set up cleanup handlers */
    atexit(cleanup);
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);

    const char *list_name = NULL;
    int cli_argc = argc;
    char **cli_argv = argv;

    /* Detect list name: if argv[1] exists and doesn't start with '-', it's a list name */
    if (argc >= 2 && argv[1][0] != '-') {
        if (!is_valid_list_name(argv[1])) {
            fprintf(stderr, "Error: Invalid list name '%s'. Use alphanumeric characters, hyphens, and underscores only (max 63 chars).\n", argv[1]);
            return 1;
        }
        list_name = argv[1];
        /* Shift argv: make argv[1] = argv[0] so cli sees program name + remaining args */
        argv[1] = argv[0];
        cli_argv = &argv[1];
        cli_argc = argc - 1;
    }

    /* Initialize database with list name */
    if (db_init(list_name) != 0) {
        fprintf(stderr, "Error: Failed to initialize database\n");
        return 1;
    }

    /* Set list name for CLI display */
    if (list_name) {
        cli_set_list_name(list_name);
    }

    if (cli_argc < 2) {
        cli_help(cli_argv[0]);
        return 1;
    }

    return cli_run(cli_argc, cli_argv);
}
