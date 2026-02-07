# Todo

A command-line todo application written in C, backed by SQLite3.

## Features

- Add, edit, delete and complete todos
- Organise by category and priority (low/medium/high)
- Due dates with absolute (`YYYY-MM-DD`) or relative (`3d`, `2w`, `1m`, `1y`) formats
- Repeating tasks (daily or monthly intervals)
- View todos by schedule: today, this week, this month, or all scheduled
- Filter by category and status
- Batch operations (complete or delete multiple todos at once)
- View recently completed todos

## Dependencies

### Arch Linux

```sh
sudo pacman -S sqlite
```

### Debian/Ubuntu

```sh
sudo apt-get install libsqlite3-dev
```

### macOS (Homebrew)

```sh
brew install sqlite
```

## Building

```sh
make
```

For a debug build:

```sh
make DEBUG=1
```

## Installation

```sh
sudo make install    # installs to /usr/local/bin
sudo make uninstall  # removes it
```

## Usage

### Adding todos

```sh
todo --add "Buy groceries" --category shopping --priority 2
todo --add "Submit report" --due 2025-06-15
todo --add "Submit report" --due 3d              # due in 3 days
todo --add "Weekly review" --due 2025-06-15 --repeat 7d
```

### Listing and filtering

```sh
todo --list
todo --list --category work --status pending
todo --today          # due today
todo --week           # due within 7 days
todo --month          # due within 31 days
todo --schedule       # all scheduled todos by due date
todo --cat            # list all categories
```

### Managing todos

```sh
todo --complete 5             # mark single todo as completed
todo --complete '[1,2,3]'     # mark multiple todos as completed
todo --delete 5
todo --delete '[1,2,3]'
todo --edit 3 --title "Updated title" --priority 3
todo --show 3                 # show full details
todo --completed-since 2025-01-01
```

### Due date formats

| Format | Example | Meaning |
|--------|---------|---------|
| `YYYY-MM-DD` | `2025-06-15` | Specific date (end of day) |
| `YYYY-MM-DD HH:MM` | `2025-06-15 14:00` | Specific date and time |
| `Nd` | `3d` | 3 days from now |
| `Nw` | `2w` | 2 weeks from now |
| `Nm` | `1m` | 1 month from now |
| `Ny` | `1y` | 1 year from now |

### Repeat intervals

```sh
todo --add "Standup" --due 2025-06-15 --repeat 1d   # daily
todo --add "Review" --due 2025-06-15 --repeat 7d    # weekly
todo --add "Report" --due 2025-06-15 --repeat 2m    # every 2 months
```

## Data storage

The database is stored at `~/.local/share/todo/todos.db`.

## License

This project is unlicensed. Feel free to use it however you like.
