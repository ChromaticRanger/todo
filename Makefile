# Todo Application Makefile

CC = gcc
CFLAGS = -Wall -Wextra -std=c99 -D_DEFAULT_SOURCE
LDFLAGS =

# Source and object files
SRCDIR = src
OBJDIR = obj
SOURCES = $(SRCDIR)/main.c $(SRCDIR)/cli.c $(SRCDIR)/db.c $(SRCDIR)/todo.c $(SRCDIR)/utils.c
OBJECTS = $(SOURCES:$(SRCDIR)/%.c=$(OBJDIR)/%.o)
TARGET = todo

# PostgreSQL (libpq) flags via pkg-config
PG_CFLAGS := $(shell pkg-config --cflags libpq 2>/dev/null)
PG_LDFLAGS := $(shell pkg-config --libs libpq 2>/dev/null)

# Combine all flags
CFLAGS += $(PG_CFLAGS)
LDFLAGS += $(PG_LDFLAGS)

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
$(OBJDIR)/main.o: $(SRCDIR)/main.c $(SRCDIR)/db.h $(SRCDIR)/cli.h $(SRCDIR)/utils.h
$(OBJDIR)/db.o: $(SRCDIR)/db.c $(SRCDIR)/db.h $(SRCDIR)/todo.h
$(OBJDIR)/todo.o: $(SRCDIR)/todo.c $(SRCDIR)/todo.h
$(OBJDIR)/cli.o: $(SRCDIR)/cli.c $(SRCDIR)/cli.h $(SRCDIR)/db.h $(SRCDIR)/todo.h $(SRCDIR)/utils.h
$(OBJDIR)/utils.o: $(SRCDIR)/utils.c $(SRCDIR)/utils.h
