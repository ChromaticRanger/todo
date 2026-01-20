#ifndef CLI_H
#define CLI_H

/* Run the CLI with given arguments, returns exit code */
int cli_run(int argc, char *argv[]);

/* Print help message */
void cli_help(const char *program_name);

#endif /* CLI_H */
