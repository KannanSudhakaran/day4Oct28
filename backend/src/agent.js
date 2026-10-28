const Anthropic = require('@anthropic-ai/sdk');
const customers = require('./customerService');

const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const MAX_STEPS = 8;
const WRITE_TOOLS = new Set(['add_customer', 'update_customer', 'delete_customer']);

const tools = [
  {
    name: 'get_all_customers',
    description: 'List every customer in the database.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_customer_by_name',
    description: 'Find customers whose name contains the given text (case-insensitive).',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Full or partial customer name' } },
      required: ['name'],
    },
  },
  {
    name: 'get_customer_by_id',
    description: 'Get a single customer by numeric id.',
    input_schema: {
      type: 'object',
      properties: { customer_id: { type: 'integer' } },
      required: ['customer_id'],
    },
  },
  {
    name: 'add_customer',
    description: 'Add a new customer.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_customer',
    description: 'Update fields of an existing customer by id. Only provided fields change.',
    input_schema: {
      type: 'object',
      properties: {
        customer_id: { type: 'integer' },
        name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
      },
      required: ['customer_id'],
    },
  },
  {
    name: 'delete_customer',
    description: 'Delete a customer by id.',
    input_schema: {
      type: 'object',
      properties: { customer_id: { type: 'integer' } },
      required: ['customer_id'],
    },
  },
];

async function runTool(name, input) {
  switch (name) {
    case 'get_all_customers': return customers.getAll();
    case 'get_customer_by_name': return customers.searchByName(input.name);
    case 'get_customer_by_id': return (await customers.getById(input.customer_id)) ?? { error: 'Not found' };
    case 'add_customer': return customers.create(input);
    case 'update_customer': {
      const { customer_id, ...fields } = input;
      return (await customers.update(customer_id, fields)) ?? { error: 'Not found' };
    }
    case 'delete_customer': return (await customers.remove(input.customer_id)) ?? { error: 'Not found' };
    default: return { error: `Unknown tool ${name}` };
  }
}

const SYSTEM =
  'You are a helpful assistant for a customer management app. Use the provided tools to read and ' +
  'modify customer data; never invent data. Customer fields: customer_id, name, email, phone, created_at. ' +
  'Answer concisely and format lists clearly.';

async function chat(message, history = []) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('ANTHROPIC_API_KEY is not set on the server');
    err.status = 503;
    throw err;
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const messages = [
    ...history.filter((m) => m && m.content).map((m) => ({ role: m.role, content: String(m.content) })),
    { role: 'user', content: message },
  ];
  const toolCalls = [];
  let dataChanged = false;

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await client.messages.create({
      model: MODEL(), max_tokens: 1024, system: SYSTEM, tools, messages,
    });
    messages.push({ role: 'assistant', content: res.content });

    if (res.stop_reason !== 'tool_use') {
      const reply = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      return { reply, toolCalls, dataChanged };
    }

    const results = [];
    for (const block of res.content.filter((b) => b.type === 'tool_use')) {
      let output;
      try {
        output = await runTool(block.name, block.input);
        if (WRITE_TOOLS.has(block.name)) dataChanged = true;
      } catch (e) {
        output = { error: e.message };
      }
      toolCalls.push({ name: block.name, input: block.input });
      results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(output) });
    }
    messages.push({ role: 'user', content: results });
  }
  return { reply: 'Sorry, I could not finish that request.', toolCalls, dataChanged };
}

module.exports = { chat };
