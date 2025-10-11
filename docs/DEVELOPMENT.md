# Development Guide

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Git
- Text editor (VS Code recommended)
- Basic knowledge of React and Express.js

### Initial Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/watchman.git
   cd watchman
   ```

2. **Install dependencies**

   ```bash
   # Frontend
   npm install

   # Backend
   cd backend
   npm install
   cd ..
   ```

3. **Configure environment**

   ```bash
   cd backend
   cp .env.example .env.local
   # Edit .env.local with your configuration
   ```

4. **Start development servers**
   ```bash
   ./start-dev.sh
   # Or run separately:
   # Terminal 1: cd backend && npm start
   # Terminal 2: npm run dev
   ```

## Project Structure

```
watchman/
├── src/                    # Frontend source
│   ├── components/        # React components
│   ├── hooks/            # Custom hooks
│   ├── pages/            # Page components
│   ├── services/         # API clients
│   ├── types/            # TypeScript types
│   └── utils/            # Utility functions
├── backend/               # Backend source
│   ├── server.js         # Main server file
│   ├── config.js         # Configuration
│   ├── middleware/       # Express middleware
│   ├── services/         # Service integrations
│   └── openapi.yaml      # API specification
├── docs/                  # Documentation
├── public/               # Static assets
└── gen/                  # Generated API client
```

## Development Workflow

### Frontend Development

#### Creating a New Component

```tsx
// src/components/MyComponent.tsx
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function MyComponent() {
  const [data, setData] = useState(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Component</CardTitle>
      </CardHeader>
      <CardContent>{/* Your content */}</CardContent>
    </Card>
  );
}
```

#### Adding a Service Card

1. Create the card component:

   ```tsx
   // src/components/MyServiceCard.tsx
   import { useQuery } from "@tanstack/react-query";
   import { api } from "@/services/api";

   export function MyServiceCard() {
     const { data, isLoading } = useQuery({
       queryKey: ["myservice", "status"],
       queryFn: () => api.getMyServiceStatus(),
       refetchInterval: 30000, // Poll every 30s
     });

     return (
       <Card>
         <CardHeader>
           <CardTitle>My Service</CardTitle>
         </CardHeader>
         <CardContent>{isLoading ? "Loading..." : data?.status}</CardContent>
       </Card>
     );
   }
   ```

2. Add to dashboard:

   ```tsx
   // src/pages/Dashboard.tsx
   import { MyServiceCard } from "@/components/MyServiceCard";

   // In the component:
   <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
     {/* ...existing cards */}
     <MyServiceCard />
   </div>;
   ```

#### Using shadcn/ui Components

```bash
# Add a new component
npx shadcn-ui@latest add button

# Use it
import { Button } from '@/components/ui/button';

<Button variant="outline">Click me</Button>
```

### Backend Development

#### Adding a New Service

1. Create service class:

   ```javascript
   // backend/services/MyService.js
   export default class MyService {
     constructor(config) {
       this.name = "myservice";
       this.host = config.host;
       this.enabled = !!this.host;
     }

     async getHealth() {
       if (!this.enabled) {
         return { status: "offline", message: "Not configured" };
       }

       try {
         // Check if service is reachable
         const response = await fetch(`http://${this.host}/api/health`);
         return {
           status: response.ok ? "online" : "offline",
           timestamp: new Date().toISOString(),
         };
       } catch (error) {
         return {
           status: "offline",
           message: error.message,
         };
       }
     }

     async getStats() {
       if (!this.enabled) return null;

       try {
         const response = await fetch(`http://${this.host}/api/stats`);
         const data = await response.json();
         return {
           timestamp: new Date().toISOString(),
           data,
         };
       } catch (error) {
         throw error;
       }
     }
   }
   ```

2. Register in ServiceManager:

   ```javascript
   // backend/services/ServiceManager.js
   import MyService from "./MyService.js";

   // In initializeServices():
   if (process.env.MYSERVICE_HOST) {
     this.services.set(
       "myservice",
       new MyService({
         host: process.env.MYSERVICE_HOST,
       })
     );
   }
   ```

3. Add API endpoints:

   ```javascript
   // backend/server.js
   app.get(
     "/api/myservice/status",
     healthLimiter,
     healthCacheMiddleware,
     async (req, res) => {
       try {
         const service = serviceManager.getService("myservice");
         if (!service) {
           return res.status(503).json({ error: "Service not configured" });
         }

         const health = await serviceManager.getServiceHealth("myservice");
         res.json(health);
       } catch (error) {
         res.status(500).json({ error: error.message });
       }
     }
   );

   app.get("/api/myservice/stats", statsCacheMiddleware, async (req, res) => {
     try {
       const service = serviceManager.getService("myservice");
       if (!service) {
         return res.status(503).json({ error: "Service not configured" });
       }

       const stats = await serviceManager.getServiceStats("myservice");
       res.json(stats);
     } catch (error) {
       res.status(500).json({ error: error.message });
     }
   });
   ```

4. Update OpenAPI spec:

   ```yaml
   # backend/openapi.yaml
   /api/myservice/status:
     get:
       tags:
         - My Service
       summary: Get service status
       operationId: getMyServiceStatus
       responses:
         "200":
           description: Service status
           content:
             application/json:
               schema:
                 $ref: "#/components/schemas/ServiceHealth"
   ```

5. Regenerate API client:
   ```bash
   # If you have a generator setup
   npm run generate-api
   ```

#### Adding Middleware

```javascript
// backend/middleware/myMiddleware.js
export const myMiddleware = (options) => {
  return (req, res, next) => {
    // Your middleware logic
    console.log("Request:", req.method, req.path);
    next();
  };
};

// Use in server.js
import { myMiddleware } from "./middleware/myMiddleware.js";
app.use(myMiddleware({ option: "value" }));
```

## API Client Generation

The frontend uses auto-generated API clients from the OpenAPI spec.

### Manual Generation (if needed)

```bash
# Install generator
npm install -g @openapitools/openapi-generator-cli

# Generate TypeScript client
openapi-generator-cli generate \
  -i backend/openapi.yaml \
  -g typescript-axios \
  -o gen/
```

### Using the Generated Client

```typescript
// src/services/api.ts
import { Configuration, DefaultApi } from "@/gen";

const config = new Configuration({
  basePath: import.meta.env.VITE_API_URL || "http://localhost:3001",
});

export const api = new DefaultApi(config);

// Usage in components
const { data } = useQuery({
  queryKey: ["bitcoin", "stats"],
  queryFn: () => api.getBitcoinStats(),
});
```

## Testing

### Backend Tests

```javascript
// backend/__tests__/services/MyService.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import MyService from '../../services/MyService.js';

describe('MyService', () => {
  let service;

  beforeEach(() => {
    service = new MyService({ host: 'localhost:8080' });
  });

  it('should check health', async () => {
    const health = await service.getHealth();
    expect(health).toHaveProperty('status');
  });
});

// Run tests
npm test
```

### Frontend Tests

```typescript
// src/components/__tests__/MyComponent.test.tsx
import { render, screen } from "@testing-library/react";
import { MyComponent } from "../MyComponent";

describe("MyComponent", () => {
  it("renders correctly", () => {
    render(<MyComponent />);
    expect(screen.getByText("My Component")).toBeInTheDocument();
  });
});
```

## Debugging

### Backend Debugging

**VS Code launch.json:**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Backend",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/backend/server.js",
      "cwd": "${workspaceFolder}/backend",
      "envFile": "${workspaceFolder}/backend/.env.local"
    }
  ]
}
```

**Console debugging:**

```javascript
// Add debug logs
console.log("Debug:", { variable, data });

// Use logger for structured logging
logger.info("Processing request", { userId, action });
logger.error("Error occurred", { error: error.message, stack: error.stack });
```

### Frontend Debugging

**React DevTools:**

- Install browser extension
- Inspect component props and state

**Network debugging:**

```typescript
// Log API calls
const { data, error } = useQuery({
  queryKey: ["mykey"],
  queryFn: async () => {
    console.log("Fetching data...");
    const result = await api.getData();
    console.log("Result:", result);
    return result;
  },
});
```

**Browser console:**

```javascript
// Access React Query devtools
// Add to App.tsx:
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

<ReactQueryDevtools initialIsOpen={false} />;
```

## Code Style

### ESLint Configuration

```bash
# Run linter
npm run lint

# Fix auto-fixable issues
npm run lint:fix
```

### Prettier

```bash
# Format code
npm run format

# Check formatting
npm run format:check
```

### TypeScript

```bash
# Type check
npm run type-check

# Watch mode
npm run type-check:watch
```

## Git Workflow

### Branch Naming

- `feature/add-new-service` - New features
- `fix/auth-bug` - Bug fixes
- `refactor/improve-caching` - Code refactoring
- `docs/update-readme` - Documentation

### Commit Messages

Follow conventional commits:

```
feat: add MyService integration
fix: resolve authentication token expiry
refactor: improve error handling in ServiceManager
docs: update API documentation
chore: update dependencies
```

### Pre-commit Hooks

The project uses pre-commit hooks to:

- Run linter
- Format code
- Check for secrets
- Validate environment

### Pull Request Process

1. Create feature branch
2. Make changes with good commits
3. Update tests
4. Update documentation
5. Push and create PR
6. Address review comments
7. Merge when approved

## Performance Optimization

### Frontend

**Code splitting:**

```typescript
// Lazy load routes
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Settings = lazy(() => import("./pages/Settings"));
```

**Memoization:**

```typescript
const MemoizedComponent = memo(MyComponent);

const memoizedValue = useMemo(() => expensiveCalculation(data), [data]);

const memoizedCallback = useCallback(() => {
  doSomething(a, b);
}, [a, b]);
```

### Backend

**Caching:**

```javascript
import { healthCacheMiddleware } from "./middleware/cache.js";

// Cache responses for 30s
app.get("/api/endpoint", healthCacheMiddleware, handler);
```

**Database queries:**

```javascript
// Use connection pooling
// Implement query optimization
// Add indexes
```

## Environment Variables

### Adding New Variables

1. Add to `.env.example`:

   ```env
   MYSERVICE_HOST=localhost:8080
   MYSERVICE_API_KEY=
   ```

2. Update config validation:

   ```javascript
   // backend/config.js
   const getConfig = () => ({
     myservice: {
       host: process.env.MYSERVICE_HOST,
       apiKey: process.env.MYSERVICE_API_KEY,
     },
   });
   ```

3. Document in README or docs

## Common Issues

### Port Already in Use

```bash
# Find process using port
lsof -ti:3001
# Kill process
kill -9 $(lsof -ti:3001)
```

### Module Not Found

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### CORS Errors

```javascript
// Update FRONTEND_URL in backend/.env.local
FRONTEND_URL = http
://localhost:5173
```

## Resources

- [React Documentation](https://react.dev)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [TailwindCSS Docs](https://tailwindcss.com/docs)
- [TanStack Query](https://tanstack.com/query/latest)
- [OpenAPI Specification](https://swagger.io/specification/)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed contribution guidelines.
