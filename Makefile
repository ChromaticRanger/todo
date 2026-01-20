# Todo Application Makefile

CC = gcc
CFLAGS = -Wall -Wextra -std=c99 -D_DEFAULT_SOURCE
LDFLAGS =

# Source and object files
SRCDIR = src
OBJDIR = obj
SOURCES = $(wildcard $(SRCDIR)/*.c)
OBJECTS = $(SOURCES:$(SRCDIR)/%.c=$(OBJDIR)/%.o)
TARGET = todo

# SQLite3 flags via pkg-config
SQLITE_CFLAGS := $(shell pkg-config --cflags sqlite3 2>/dev/null)
SQLITE_LDFLAGS := $(shell pkg-config --libs sqlite3 2>/dev/null)

# CDK and ncurses flags (CDK doesn't have pkg-config on some systems)
CDK_CFLAGS := -I/usr/include/cdk
CDK_LDFLAGS := -lcdk -lncurses

# Combine all flags
CFLAGS += $(SQLITE_CFLAGS) $(CDK_CFLAGS)
LDFLAGS += $(SQLITE_LDFLAGS) $(CDK_LDFLAGS)

# Debug build
ifdef DEBUG
	CFLAGS += -g -O0 -DDEBUG
else
	CFLAGS += -O2
endif

.PHONY: all clean install uninstall

all: $(OBJDIR) $(TARGET)

$(OBJDIR):
	mkdir -p $(OBJDIR)

$(TARGET): $(OBJECTS)
	$(CC) $(OBJECTS) -o $@ $(LDFLAGS)

$(OBJDIR)/%.o: $(SRCDIR)/%.c
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -rf $(OBJDIR) $(TARGET)

install: $(TARGET)
	install -Dm755 $(TARGET) /usr/local/bin/$(TARGET)

uninstall:
	rm -f /usr/local/bin/$(TARGET)

# Dependencies
$(OBJDIR)/main.o: $(SRCDIR)/main.c $(SRCDIR)/db.h $(SRCDIR)/cli.h $(SRCDIR)/tui.h
$(OBJDIR)/db.o: $(SRCDIR)/db.c $(SRCDIR)/db.h $(SRCDIR)/todo.h $(SRCDIR)/utils.h
$(OBJDIR)/todo.o: $(SRCDIR)/todo.c $(SRCDIR)/todo.h
$(OBJDIR)/cli.o: $(SRCDIR)/cli.c $(SRCDIR)/cli.h $(SRCDIR)/db.h $(SRCDIR)/todo.h
$(OBJDIR)/tui.o: $(SRCDIR)/tui.c $(SRCDIR)/tui.h $(SRCDIR)/db.h $(SRCDIR)/todo.h
$(OBJDIR)/utils.o: $(SRCDIR)/utils.c $(SRCDIR)/utils.h
