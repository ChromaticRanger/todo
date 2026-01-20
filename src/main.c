#include <stdio.h>
#include <stdlib.h>
#include <signal.h>

#include "db.h"
#include "cli.h"
#include "tui.h"

static void cleanup(void) {
    db_close();
}

static void signal_handler(int sig) {
    (void)sig;
    cleanup();
    exit(1);
}

int main(int argc, char *argv[]) {
    /* Set up cleanup handlers */
    atexit(cleanup);
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);

    /* Initialize database */
    if (db_init() != 0) {
        fprintf(stderr, "Error: Failed to initialize database\n");
        return 1;
    }

    int result;

    if (argc > 1) {
        /* CLI mode */
        result = cli_run(argc, argv);

        /* If cli_run returns -1, launch TUI */
        if (result == -1) {
            result = tui_run();
        }
    } else {
        /* No arguments - launch TUI */
        result = tui_run();
    }

    return result;
}
