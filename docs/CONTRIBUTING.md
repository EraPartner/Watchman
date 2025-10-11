# Contributing to Watchman

Thank you for your interest in contributing to Watchman! This document provides guidelines and instructions for
contributing.

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inspiring community for all. Please be respectful and constructive in all
interactions.

### Our Standards

**Positive behavior includes:**

- Using welcoming and inclusive language
- Being respectful of differing viewpoints
- Gracefully accepting constructive criticism
- Focusing on what is best for the community

**Unacceptable behavior includes:**

- Harassment, trolling, or discriminatory comments
- Publishing others' private information
- Other conduct deemed inappropriate in a professional setting

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check existing issues. When creating a bug report, include:

**Bug Report Template:**

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce:

1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Environment:**

- OS: [e.g. macOS, Ubuntu 22.04]
- Node version: [e.g. 18.17.0]
- Browser: [e.g. Chrome 118]
- Version: [e.g. 1.0.0]

**Additional context**
Any other relevant information.
```

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

**Enhancement Template:**

```markdown
**Is your feature request related to a problem?**
A clear description of the problem.

**Describe the solution you'd like**
What you want to happen.

**Describe alternatives you've considered**
Other solutions or features you've considered.

**Additional context**
Mockups, examples, or other context.
```

### Pull Requests

1. **Fork the repository**

   ```bash
   # Click "Fork" on GitHub, then:
   git clone https://github.com/YOUR_USERNAME/watchman.git
   cd watchman
   git remote add upstream https://github.com/ORIGINAL_OWNER/watchman.git
   ```

2. **Create a branch**

   ```bash
   git checkout -b feature/my-new-feature
   # or
   git checkout -b fix/bug-description
   ```

3. **Make your changes**

    - Write clean, documented code
    - Follow existing code style
    - Add tests if applicable
    - Update documentation

4. **Test your changes**

   ```bash
   # Frontend
   npm run lint
   npm run type-check
   npm run build

   # Backend
   cd backend
   npm run lint
   npm test
   ```

5. **Commit your changes**

   ```bash
   git add .
   git commit -m "feat: add new service integration"
   ```

   Use [Conventional Commits](https://www.conventionalcommits.org/):

    - `feat:` - New feature
    - `fix:` - Bug fix
    - `docs:` - Documentation changes
    - `style:` - Code style changes (formatting)
    - `refactor:` - Code refactoring
    - `test:` - Adding tests
    - `chore:` - Maintenance tasks

6. **Push to your fork**

   ```bash
   git push origin feature/my-new-feature
   ```

7. **Open a Pull Request**
    - Go to the original repository
    - Click "New Pull Request"
    - Select your fork and branch
    - Fill out the PR template
    - Link related issues

### Pull Request Guidelines

**PR Checklist:**

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests added/updated
- [ ] All tests pass
- [ ] No merge conflicts

**PR Description Template:**

```markdown
## Description

Brief description of changes.

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## How Has This Been Tested?

Describe the tests you ran.

## Screenshots (if applicable)

Add screenshots for UI changes.

## Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests pass
- [ ] No merge conflicts

## Related Issues

Closes #123
Relates to #456
```

## Development Setup

See [DEVELOPMENT.md](./DEVELOPMENT.md) for detailed development setup instructions.

## Coding Standards

### TypeScript/JavaScript

**Style Guidelines:**

- Use TypeScript for type safety
- Use meaningful variable names
- Keep functions small and focused
- Add JSDoc comments for complex functions
- Use async/await over promises
- Handle errors appropriately

**Example:**

```typescript
/**
 * Fetches service health status with caching
 * @param serviceName - The service identifier
 * @param options - Optional configuration
 * @returns Service health data
 * @throws {ServiceError} When service is unavailable
 */
async function getServiceHealth(
  serviceName: string,
  options?: HealthOptions
): Promise<ServiceHealth> {
  try {
    // Implementation
  } catch (error) {
    logger.error("Failed to fetch health", { serviceName, error });
    throw new ServiceError(`Health check failed: ${error.message}`);
  }
}
```

### React Components

**Component Guidelines:**

- Use functional components with hooks
- Keep components focused (single responsibility)
- Extract reusable logic into custom hooks
- Use TypeScript interfaces for props
- Memoize expensive computations

**Example:**

```typescript
interface ServiceCardProps {
  serviceName: string;
  refreshInterval?: number;
  onError?: (error: Error) => void;
}

export function ServiceCard({
  serviceName,
  refreshInterval = 30000,
  onError,
}: ServiceCardProps) {
  const { data, isLoading, error } = useServiceHealth(serviceName, {
    refreshInterval,
  });

  useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  return <Card>{/* Component JSX */}</Card>;
}
```

### Backend Services

**Service Class Pattern:**

```javascript
/**
 * Service integration for ExternalService
 */
export default class ExternalService {
  constructor(config) {
    this.name = "external";
    this.config = config;
    this.enabled = this.checkConfig();
  }

  /**
   * Validates service configuration
   * @returns {boolean} Whether service is properly configured
   */
  checkConfig() {
    return !!(this.config.host && this.config.apiKey);
  }

  /**
   * Gets service health status
   * @returns {Promise<ServiceHealth>}
   */
  async getHealth() {
    // Implementation with error handling
  }

  /**
   * Gets service statistics
   * @returns {Promise<ServiceStats>}
   */
  async getStats() {
    // Implementation with error handling
  }
}
```

## Testing

### Writing Tests

**Backend Tests:**

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import MyService from "../MyService.js";

describe("MyService", () => {
  let service;

  beforeEach(() => {
    service = new MyService({ host: "localhost", apiKey: "test" });
  });

  describe("getHealth", () => {
    it("returns online when service responds", async () => {
      // Mock fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "ok" }),
      });

      const health = await service.getHealth();

      expect(health.status).toBe("online");
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("localhost"));
    });

    it("returns offline when service is unreachable", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const health = await service.getHealth();

      expect(health.status).toBe("offline");
    });
  });
});
```

**Frontend Tests:**

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MyComponent } from "../MyComponent";

describe("MyComponent", () => {
  const queryClient = new QueryClient();

  it("displays loading state", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MyComponent />
      </QueryClientProvider>
    );

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("displays data when loaded", async () => {
    // Mock API
    vi.mock("@/services/api", () => ({
      api: {
        getData: vi.fn().mockResolvedValue({ status: "online" }),
      },
    }));

    render(
      <QueryClientProvider client={queryClient}>
        <MyComponent />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("online")).toBeInTheDocument();
    });
  });
});
```

### Test Coverage

Aim for:

- Critical paths: 100%
- Business logic: 80%+
- UI components: 60%+
- Overall: 70%+

Run coverage:

```bash
npm run test:coverage
```

## Documentation

### Code Documentation

**JSDoc for complex functions:**

```javascript
/**
 * Processes service statistics and calculates trends
 * @param {ServiceStats} stats - Raw statistics from service
 * @param {Object} options - Processing options
 * @param {boolean} options.includeHistory - Include historical data
 * @param {number} options.days - Number of days to analyze
 * @returns {ProcessedStats} Processed statistics with trends
 * @throws {ValidationError} When stats format is invalid
 * @example
 * const processed = processStats(stats, { days: 7 });
 * console.log(processed.trend); // 'increasing'
 */
function processStats(stats, options = {}) {
  // Implementation
}
```

### Updating Documentation

When making changes, update relevant documentation:

- Code comments
- README.md
- API documentation (OpenAPI spec)
- Architecture docs
- User guides

## Security

### Security Best Practices

**Never commit:**

- Passwords, API keys, or tokens
- Private keys or certificates
- Environment files (.env.local)
- Personal information

**Always:**

- Use environment variables for secrets
- Validate and sanitize user input
- Use parameterized queries
- Implement rate limiting
- Add authentication checks
- Log security events

**Reporting Security Issues:**
Do not open public issues for security vulnerabilities. Instead, email security@yourproject.com with:

- Description of vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Review Process

### Code Review Guidelines

**For Authors:**

- Keep PRs focused and small
- Write clear descriptions
- Respond to feedback promptly
- Make requested changes
- Don't take feedback personally

**For Reviewers:**

- Be respectful and constructive
- Explain the "why" behind suggestions
- Approve when satisfied
- Consider the author's approach
- Focus on important issues

### Review Checklist

- [ ] Code is readable and maintainable
- [ ] No unnecessary complexity
- [ ] Error handling is appropriate
- [ ] Security considerations addressed
- [ ] Performance is acceptable
- [ ] Tests are adequate
- [ ] Documentation is clear

## Release Process

Maintainers follow this process for releases:

1. **Version Bump**

   ```bash
   npm version patch  # or minor, major
   ```

2. **Update Changelog**

    - Document all changes
    - Credit contributors

3. **Create Release**

    - Tag in git
    - Create GitHub release
    - Include release notes

4. **Deploy**
    - Deploy to staging
    - Run smoke tests
    - Deploy to production
    - Monitor for issues

## Getting Help

- **Documentation**: Check docs/ folder
- **Issues**: Search existing GitHub issues
- **Discussions**: Use GitHub Discussions for questions
- **Discord/Slack**: Join community chat (if available)

## Recognition

Contributors will be:

- Added to CONTRIBUTORS.md
- Mentioned in release notes
- Credited in documentation

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Watchman! 🎉
