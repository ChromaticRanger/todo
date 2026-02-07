#ifndef CLI_H
#define CLI_H

/* Run the CLI with given arguments, returns exit code */
int cli_run(int argc, char *argv[]);

/* Print help message */
void cli_help(const char *program_name);

/* Set the active list name for display purposes */
void cli_set_list_name(const char *name);

#endif /* CLI_H */
