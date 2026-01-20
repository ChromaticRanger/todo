# CLI/TUI Todo Application - Implementation Plan

## Project Overview
Build a command-line todo application in C with dual interfaces:
1. Direct CLI operations for quick CRUD actions
2. Interactive TUI for browsing and managing todos

## Technology Stack
- **Language**: C (C99 or later)
- **CLI Parser**: getopt_long (POSIX)
- **TUI Framework**: CDK (Curses Development Kit)
- **Database**: SQLite3
- **Build System**: Makefile (with pkg-config for dependencies)

## Core Requirements

### Data Model
Each todo item contains:
- `id` (integer, auto-increment primary key)
- `title` (text, required, max 255 chars)
- `description` (text, optional)
- `category` (text, default "general")
- `priority` (integer: 1=low, 2=medium, 3=high, default 2)
- `status` (integer: 0=pending, 1=completed, default 0)
- `created_at` (timestamp)
- `completed_at` (timestamp, nullable)

### Database Schema
```sql
CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    priority INTEGER DEFAULT 2,
    status INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_category ON todos(category);
CREATE INDEX IF NOT EXISTS idx_status ON todos(status);
```

Database location: `~/.local/share/todo/todos.db`

## Directory Structure
```
todo/
├── src/
│   ├── main.c              # Entry point, mode selection
│   ├── cli.c               # CLI argument parsing and execution
│   ├── cli.h
│   ├── tui.c               # TUI interface using CDK
│   ├── tui.h
│   ├── db.c                # Database operations
│   ├── db.h
│   ├── todo.c              # Core todo business logic
│   ├── todo.h
│   └── utils.c             # Utility functions (paths, formatting)
│   └── utils.h
├── Makefile
├── README.md
└── .gitignore
```

## CLI Interface Specification

### Command Format
```
todo [OPTIONS]
todo [COMMAND] [OPTIONS]
```

### Commands and Options

**Add a todo:**
```
todo --add "Todo title" [--description "Details"] [--category "work"] [--priority 1-3]
todo -a "Todo title" [-d "Details"] [-c "work"] [-p 1-3]
```

**List todos:**
```
todo --list [--category "work"] [--status pending|completed|all]
todo -l [-c "work"] [-s pending|completed|all]
```

**Complete a todo:**
```
todo --complete ID
todo -C ID
```

**Delete a todo:**
```
todo --delete ID
todo -D ID
```

**Edit a todo:**
```
todo --edit ID [--title "New title"] [--description "New desc"] [--category "new"] [--priority 1-3]
todo -e ID [-t "New title"] [-d "New desc"] [-c "new"] [-p 1-3]
```

**Show details:**
```
todo --show ID
todo -s ID
```

**Launch TUI:**
```
todo --tui
todo -i
(or just 'todo' with no arguments)
```

**Help:**
```
todo --help
todo -h
```

### Output Format
- List view: Show ID, Priority indicator, Category, Title, Status
- Example: `[12] [H] work: Fix database connection bug [✓]`
- Priority indicators: [L]=Low, [M]=Medium, [H]=High
- Status: [✓]=Completed, [ ]=Pending

## TUI Interface Specification

### Main View
```
╔═══════════════════════════════════════════════════════════════╗
║                        Todo Manager                           ║
╠═══════════════════════════════════════════════════════════════╣
║ Categories: [All] [work] [personal] [shopping] ...            ║
╠═══════════════════════════════════════════════════════════════╣
║ Status: [ ] Pending  [ ] Completed  [x] All                   ║
╠═══════════════════════════════════════════════════════════════╣
║ ID  Pri  Category    Title                            Status  ║
║ ------------------------------------------------------------ ║
║ 12  [H]  work        Fix database connection          [ ]    ║
║ 13  [M]  personal    Call dentist                     [ ]    ║
║ 14  [L]  shopping    Buy groceries                    [✓]    ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║ [a]dd [e]dit [d]elete [c]omplete [v]iew [f]ilter [q]uit      ║
╚═══════════════════════════════════════════════════════════════╝
```

### TUI Features
1. **Category filter** (CDKMENU): Select category to filter by
2. **Status filter**: Toggle between Pending/Completed/All
3. **Todo list** (CDKSCROLL): Scrollable list of todos
4. **Actions menu**: Single-key commands for operations
5. **Add dialog** (CDKENTRY): Multi-field form for new todo
6. **Edit dialog** (CDKENTRY): Pre-populated form for editing
7. **View dialog**: Show full details including description
8. **Confirmation dialog** (CDKDIALOG): Confirm deletions

### TUI Navigation
- Arrow keys: Navigate list
- Enter: View details
- 'a': Add new todo
- 'e': Edit selected todo
- 'd': Delete selected todo (with confirmation)
- 'c': Toggle completion status
- 'f': Open filter menu
- 'q': Quit application

## Implementation Phases

### Phase 1: Core Database Layer
**Files**: `db.c`, `db.h`, `utils.c`, `utils.h`

1. Implement database initialization
   - Create database directory if not exists
   - Create database file if not exists
   - Execute schema creation
2. Implement CRUD operations:
   - `db_init()` - Initialize/open database
   - `db_close()` - Close database connection
   - `db_add_todo()` - Insert new todo
   - `db_get_todos()` - Retrieve todos with filters
   - `db_get_todo_by_id()` - Get single todo
   - `db_update_todo()` - Update existing todo
   - `db_delete_todo()` - Delete todo
   - `db_complete_todo()` - Mark as completed
   - `db_get_categories()` - Get list of unique categories
3. Implement utility functions:
   - `get_db_path()` - Get database file path
   - `ensure_directory()` - Create directories if needed

### Phase 2: Data Structures and Business Logic
**Files**: `todo.c`, `todo.h`

1. Define structs:
```c
typedef struct {
    int id;
    char title[256];
    char description[1024];
    char category[64];
    int priority;
    int status;
    time_t created_at;
    time_t completed_at;
} Todo;

typedef struct {
    char *category;
    int status; // -1=all, 0=pending, 1=completed
} TodoFilter;
```

2. Implement business logic:
   - `todo_validate()` - Validate todo data
   - `todo_format_display()` - Format for display
   - `todo_priority_string()` - Convert priority to string
   - `todo_status_string()` - Convert status to string

### Phase 3: CLI Interface
**Files**: `cli.c`, `cli.h`

1. Implement argument parsing with getopt_long
2. Define long and short options
3. Implement command handlers:
   - `cli_add()` - Handle add command
   - `cli_list()` - Handle list command
   - `cli_complete()` - Handle complete command
   - `cli_delete()` - Handle delete command
   - `cli_edit()` - Handle edit command
   - `cli_show()` - Handle show command
   - `cli_help()` - Display help text
4. Implement output formatting for list view

### Phase 4: TUI Interface
**Files**: `tui.c`, `tui.h`

1. Initialize CDK:
   - Set up curses screen
   - Initialize CDK screen
   - Set up color pairs if available
2. Implement main loop:
   - `tui_run()` - Main TUI event loop
   - `tui_refresh_list()` - Reload todo list
   - `tui_draw()` - Redraw interface
3. Implement dialogs:
   - `tui_add_dialog()` - Add new todo
   - `tui_edit_dialog()` - Edit existing todo
   - `tui_view_dialog()` - View todo details
   - `tui_delete_confirm()` - Confirm deletion
   - `tui_filter_dialog()` - Select filters
4. Implement list rendering:
   - Create CDKSCROLL widget
   - Populate with formatted todo items
   - Handle selection and navigation
5. Implement keyboard handling:
   - Map keys to actions
   - Handle special keys (arrows, enter, etc.)

### Phase 5: Main Entry Point and Integration
**Files**: `main.c`

1. Implement main():
   - Initialize database
   - Check for CLI arguments
   - Route to CLI mode or TUI mode
   - Handle errors and cleanup
2. Implement cleanup handlers:
   - Close database connection
   - Clean up CDK resources
   - Restore terminal state

### Phase 6: Build System
**Files**: `Makefile`

1. Set compiler flags: `-Wall -Wextra -std=c99`
2. Use pkg-config for dependencies:
   - `pkg-config --cflags --libs sqlite3`
   - `pkg-config --cflags --libs cdk`
   - `-lncurses` (CDK dependency)
3. Create targets:
   - `all`: Build executable
   - `clean`: Remove build artifacts
   - `install`: Install to /usr/local/bin (optional)
   - `uninstall`: Remove from /usr/local/bin (optional)
4. Create object file dependencies

### Phase 7: Documentation and Polish
**Files**: `README.md`

1. Document installation requirements:
   - Required packages: sqlite3, cdk, ncurses
   - Build instructions
2. Document usage:
   - CLI examples
   - TUI screenshots/descriptions
3. Document features and roadmap

## Error Handling Requirements

1. **Database errors**: 
   - Handle connection failures
   - Handle query failures
   - Provide meaningful error messages

2. **Input validation**:
   - Validate todo ID exists
   - Validate required fields
   - Validate priority range (1-3)
   - Validate string lengths

3. **File system errors**:
   - Handle directory creation failures
   - Handle database file access issues

4. **Memory management**:
   - Free all allocated memory
   - Handle allocation failures
   - No memory leaks (test with valgrind)

5. **User feedback**:
   - Success messages for operations
   - Clear error messages
   - Help text for invalid usage

## Testing Checklist

### CLI Testing
- [ ] Add todo with all fields
- [ ] Add todo with minimal fields
- [ ] List all todos
- [ ] List by category
- [ ] List by status
- [ ] Complete a todo
- [ ] Delete a todo
- [ ] Edit a todo (each field)
- [ ] Show todo details
- [ ] Invalid ID handling
- [ ] Invalid arguments handling
- [ ] Help text display

### TUI Testing
- [ ] Launch TUI
- [ ] Navigate list with arrows
- [ ] Add new todo
- [ ] Edit existing todo
- [ ] Delete todo with confirmation
- [ ] Toggle completion
- [ ] Filter by category
- [ ] Filter by status
- [ ] View todo details
- [ ] Quit application
- [ ] Handle empty list
- [ ] Handle terminal resize

### Database Testing
- [ ] Database creation on first run
- [ ] Data persistence across runs
- [ ] Category listing
- [ ] Filter operations
- [ ] Update operations
- [ ] Delete operations

## Dependencies Installation

### Debian/Ubuntu
```bash
sudo apt-get install libsqlite3-dev libcdk5-dev libncurses-dev
```

### Arch Linux
```bash
sudo pacman -S sqlite cdk ncurses
```

### macOS (Homebrew)
```bash
brew install sqlite cdk
```

## Build and Run

```bash
# Build
make

# Run CLI
./todo --add "My first todo"
./todo --list

# Run TUI
./todo
```

## Future Enhancements (Optional)
- Due dates with reminders
- Tags system (in addition to categories)
- Recurring todos
- Archive completed todos
- Export to JSON/CSV
- Search functionality
- Sorting options
- Undo last operation
- Configuration file for defaults
- Multiple todo lists/projects

## Notes for Implementation

1. Start with Phase 1 (database layer) and test thoroughly before moving on
2. Use prepared statements for all SQL queries to prevent injection
3. Handle SQLite's thread safety appropriately
4. Clean up CDK resources properly to avoid terminal corruption
5. Use consistent error codes and messages
6. Comment complex logic, especially in TUI event handling
7. Follow consistent naming conventions (snake_case for functions)
8. Keep functions small and focused (single responsibility)
9. Use const correctness where appropriate
10. Test memory leaks with valgrind during development

## Success Criteria

The application is complete when:
1. All CLI commands work as specified
2. TUI provides full CRUD functionality
3. Data persists correctly between sessions
4. No memory leaks detected
5. Handles errors gracefully without crashes
6. Terminal state restored properly on exit
7. README documents all features clearly
8. Code compiles without warnings
