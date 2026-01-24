#include <stdio.h>
#include <stdlib.h>
#include <signal.h>

#include "db.h"
#include "cli.h"

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

    if (argc < 2) {
        cli_help(argv[0]);
        return 1;
    }

    return cli_run(argc, argv);
}
