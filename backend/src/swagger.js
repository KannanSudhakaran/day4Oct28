const customer = {
  type: 'object',
  properties: {
    customer_id: { type: 'integer', example: 1 },
    name: { type: 'string', example: 'Jane Doe' },
    email: { type: 'string', nullable: true, example: 'jane@example.com' },
    phone: { type: 'string', nullable: true, example: '9876543210' },
    created_at: { type: 'string', format: 'date-time' },
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

const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };
const notFound = { description: 'Customer not found' };
const ok = (schema, description = 'OK') => ({
  description,
  content: { 'application/json': { schema } },
});

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Customer API',
    version: '1.0.0',
    description: 'CRUD for customers (PostgreSQL) plus a natural-language agent powered by Anthropic.',
  },
  servers: [{ url: '/' }],
  tags: [{ name: 'Customers' }, { name: 'Agent' }],
  components: { schemas: { Customer: customer, CustomerInput: customerInput } },
  paths: {
    '/api/customers': {
      get: {
        tags: ['Customers'],
        summary: 'Get all customers',
        parameters: [
          { name: 'name', in: 'query', required: false, schema: { type: 'string' }, description: 'Filter by (partial) name' },
        ],
        responses: { 200: ok({ type: 'array', items: customer }) },
      },
      post: {
        tags: ['Customers'],
        summary: 'Add a customer',
        requestBody: { required: true, content: { 'application/json': { schema: customerInput } } },
        responses: { 201: ok(customer, 'Created'), 400: { description: 'Validation error' } },
      },
    },
    '/api/customers/{id}': {
      get: {
        tags: ['Customers'], summary: 'Get a customer by id', parameters: [idParam],
        responses: { 200: ok(customer), 404: notFound },
      },
      put: {
        tags: ['Customers'], summary: 'Update a customer', parameters: [idParam],
        requestBody: { required: true, content: { 'application/json': { schema: customerInput } } },
        responses: { 200: ok(customer), 404: notFound },
      },
      delete: {
        tags: ['Customers'], summary: 'Delete a customer', parameters: [idParam],
        responses: { 200: ok(customer, 'Deleted'), 404: notFound },
      },
    },
    '/api/agent': {
      post: {
        tags: ['Agent'],
        summary: 'Ask a natural-language question about customers',
        description: 'e.g. "show all customers", "find customer Kannan", "add customer Bob, bob@x.com, 555-1234".',
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
        },
      },
    },
  },
};
