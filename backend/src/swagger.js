const customer = {
  type: 'object',
  properties: {
    customer_id: { type: 'integer', example: 1 },
    name: { type: 'string', example: 'Jane Doe' },
    email: { type: 'string', nullable: true, example: 'jane@example.com' },
    phone: { type: 'string', nullable: true, example: '9876543210' },
    created_at: { type: 'string', format: 'date-time' },
    sales_user_id: { type: 'integer', example: 1, description: 'Owning sales user (set from the token)' },
  },
};

const customerInput = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', example: 'Jane Doe' },
    email: { type: 'string', example: 'jane@example.com' },
    phone: { type: 'string', example: '9876543210' },
  },
};

const user = {
  type: 'object',
  properties: {
    user_id: { type: 'integer', example: 1 },
    name: { type: 'string', example: 'Sam Sales' },
    email: { type: 'string', example: 'sam@example.com' },
    role: { type: 'string', example: 'sales' },
    created_at: { type: 'string', format: 'date-time' },
  },
};

const registerInput = {
  type: 'object',
  required: ['name', 'email', 'password'],
  properties: {
    name: { type: 'string', example: 'Sam Sales' },
    email: { type: 'string', example: 'sam@example.com' },
    password: { type: 'string', minLength: 8, example: 'password123' },
  },
};

const loginInput = {
  type: 'object',
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', example: 'sam@example.com' },
    password: { type: 'string', example: 'password123' },
  },
};

const authResponse = {
  type: 'object',
  properties: { token: { type: 'string', description: 'JWT; paste into the Authorize dialog' }, user },
};

const adminUser = {
  type: 'object',
  properties: {
    user_id: { type: 'integer', example: 2 },
    name: { type: 'string', example: 'Sam Sales' },
    email: { type: 'string', example: 'sam@example.com' },
    role: { type: 'string', example: 'sales' },
    created_at: { type: 'string', format: 'date-time' },
    customer_count: { type: 'integer', example: 12 },
  },
};

const secured = [{ bearerAuth: [] }];
const unauthorized = { description: 'Missing, invalid or expired token' };
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };
const forbiddenSales = { description: 'Sales access required (admin tokens are rejected)' };
const notFound = { description: 'Customer not found (or owned by another user)' };
const ok = (schema, description = 'OK') => ({
  description,
  content: { 'application/json': { schema } },
});

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Customer API',
    version: '2.0.0',
    description:
      'Register and log in to get a JWT, then click Authorize and paste the token. ' +
      'Customers and the Anthropic-powered agent only ever see the logged-in sales user\'s own customers.',
  },
  servers: [{ url: '/' }],
  tags: [{ name: 'Auth' }, { name: 'Customers' }, { name: 'Agent' }, { name: 'Admin' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Customer: customer,
      CustomerInput: customerInput,
      User: user,
      RegisterInput: registerInput,
      LoginInput: loginInput,
      AuthResponse: authResponse,
      AdminUserSummary: adminUser,
    },
  },
  paths: {
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new user (role is always "sales")',
        requestBody: { required: true, content: { 'application/json': { schema: registerInput } } },
        responses: {
          201: ok(user, 'Created'),
          400: { description: 'Validation error' },
          409: { description: 'Email already registered' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in as a sales user and receive a JWT',
        description: 'Sales accounts only. Admins use /api/admin/login.',
        requestBody: { required: true, content: { 'application/json': { schema: loginInput } } },
        responses: {
          200: ok(authResponse),
          400: { description: 'Missing fields' },
          401: { description: 'Invalid email or password' },
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Auth'], summary: 'Current user', security: secured,
        responses: { 200: ok(user), 401: unauthorized },
      },
    },
    '/api/admin/login': {
      post: {
        tags: ['Admin'],
        summary: 'Log in as admin and receive a JWT',
        description: 'Admin accounts only. Sales accounts get the same 401 as a wrong password.',
        requestBody: { required: true, content: { 'application/json': { schema: loginInput } } },
        responses: {
          200: ok(authResponse),
          400: { description: 'Missing fields' },
          401: { description: 'Invalid email or password' },
        },
      },
    },
    '/api/admin/users': {
      get: {
        tags: ['Admin'], security: secured,
        summary: 'List sales users with their customer counts',
        parameters: [{ name: 'q', in: 'query', required: false, schema: { type: 'string' }, description: 'Filter by name or email (substring, case-insensitive)' }],
        responses: {
          200: ok({ type: 'array', items: adminUser }),
          401: unauthorized,
          403: { description: 'Admin access required' },
        },
      },
    },
    '/api/customers': {
      get: {
        tags: ['Customers'],
        security: secured,
        summary: 'Get all of my customers',
        description: 'Only customers owned by the logged-in user are returned.',
        parameters: [
          { name: 'name', in: 'query', required: false, schema: { type: 'string' }, description: 'Filter by (partial) name' },
        ],
        responses: { 200: ok({ type: 'array', items: customer }), 401: unauthorized, 403: forbiddenSales },
      },
      post: {
        tags: ['Customers'],
        security: secured,
        summary: 'Add a customer (owned by the logged-in user)',
        requestBody: { required: true, content: { 'application/json': { schema: customerInput } } },
        responses: { 201: ok(customer, 'Created'), 400: { description: 'Validation error' }, 401: unauthorized, 403: forbiddenSales },
      },
    },
    '/api/customers/export': {
      get: {
        tags: ['Customers'], security: secured,
        summary: 'Export my customers to Excel',
        description: 'Downloads an .xlsx file containing only the logged-in user\'s customers. Optional name filter, as in the list.',
        parameters: [{ name: 'name', in: 'query', required: false, schema: { type: 'string' }, description: 'Only customers whose name contains this text' }],
        responses: {
          200: {
            description: 'Excel workbook (customers-YYYY-MM-DD.xlsx)',
            content: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } } },
          },
          401: unauthorized,
          403: forbiddenSales,
        },
      },
    },
    '/api/customers/{id}': {
      get: {
        tags: ['Customers'], security: secured, summary: 'Get one of my customers by id', parameters: [idParam],
        responses: { 200: ok(customer), 401: unauthorized, 403: forbiddenSales, 404: notFound },
      },
      put: {
        tags: ['Customers'], security: secured, summary: 'Update one of my customers', parameters: [idParam],
        requestBody: { required: true, content: { 'application/json': { schema: customerInput } } },
        responses: { 200: ok(customer), 401: unauthorized, 403: forbiddenSales, 404: notFound },
      },
      delete: {
        tags: ['Customers'], security: secured, summary: 'Delete one of my customers', parameters: [idParam],
        responses: { 200: ok(customer, 'Deleted'), 401: unauthorized, 403: forbiddenSales, 404: notFound },
      },
    },
    '/api/agent': {
      post: {
        tags: ['Agent'],
        security: secured,
        summary: 'Ask a natural-language question about my customers',
        description:
          'e.g. "show all customers", "find customer Kannan", "add customer Bob, bob@x.com, 555-1234". ' +
          'The agent can only read and change the logged-in user\'s customers.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message'],
                properties: {
                  message: { type: 'string', example: 'Get all customers' },
                  history: {
                    type: 'array',
                    description: 'Optional prior turns [{role, content}] for multi-turn chat',
                    items: {
                      type: 'object',
                      properties: { role: { type: 'string', enum: ['user', 'assistant'] }, content: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: ok({
            type: 'object',
            properties: {
              reply: { type: 'string' },
              toolCalls: { type: 'array', items: { type: 'object' } },
              dataChanged: { type: 'boolean' },
            },
          }),
          400: { description: 'Missing message' },
          401: unauthorized,
          403: forbiddenSales,
        },
      },
    },
  },
};
