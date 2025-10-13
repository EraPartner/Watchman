# Logging Configuration

The Watchman backend includes a structured logging system with security-focused redaction. You can easily control
logging behavior through environment variables.

## Environment Variables

### LOG_ENABLED

**Default:** `true`

Completely disable all logging output.

```bash
# Disable all logging
LOG_ENABLED=false

# Enable all logging (default)
LOG_ENABLED=true
```

### LOG_REQUESTS

**Default:** `true`

Disable verbose request/response logging while keeping other application logs.

```bash
# Disable request logging only
LOG_REQUESTS=false

# Enable request logging (default)
LOG_REQUESTS=true
```

### LOG_LEVEL

**Default:** `info`

Control the minimum log level to output. Available levels (in order of verbosity):

- `error` - Only error messages
- `warn` - Warnings and errors
- `info` - Informational messages, warnings, and errors (default)
- `debug` - All messages including debug information

```bash
# Only show errors
LOG_LEVEL=error

# Show warnings and errors
LOG_LEVEL=warn

# Show info, warnings, and errors (default)
LOG_LEVEL=info

# Show everything including debug logs
LOG_LEVEL=debug
```

## Common Use Cases

### Development - Minimal Logging

For a cleaner console during development:

```bash
# In your .env.local file
LOG_REQUESTS=false
LOG_LEVEL=warn
```

### Development - No Logging

To completely silence all logs:

```bash
# In your .env.local file
LOG_ENABLED=false
```

### Production - Full Logging

For production environments with comprehensive logging:

```bash
# In your .env.local file
LOG_ENABLED=true
LOG_REQUESTS=true
LOG_LEVEL=info
```

### Production - Errors Only

For production with minimal output:

```bash
# In your .env.local file
LOG_ENABLED=true
LOG_REQUESTS=false
LOG_LEVEL=error
```

## Security Features

The logger automatically redacts sensitive information from logs:

- Passwords
- Tokens
- Secrets
- Authorization headers
- Bearer tokens
- Email addresses

This happens regardless of the logging level, ensuring sensitive data is never written to logs.

## Quick Start

To disable extensive logging right now, add this to your `.env.local` file:

```bash
LOG_REQUESTS=false
```

Then restart your backend server. This will keep error and warning logs but remove the verbose request/response logging.
