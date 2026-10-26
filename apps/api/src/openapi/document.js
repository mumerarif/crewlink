const announcementId = '27000000-aaaa-4000-8000-000000000001';

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const jsonContent = (schema, example) => ({
  'application/json': { schema, ...(example ? { example } : {}) },
});
const response = (description, schema, example) => ({
  description,
  ...(schema ? { content: jsonContent(schema, example) } : {}),
});
const success = (data, extra = {}) => ({
  type: 'object',
  additionalProperties: false,
  required: ['success', 'data'],
  properties: { success: { type: 'boolean', const: true }, data, ...extra },
});
const errorResponse = (description) => response(description, ref('Error'));
const standardErrors = {
  400: errorResponse('Validation failed.'),
  401: errorResponse('A valid Bearer JWT is required.'),
  403: errorResponse('The authenticated user does not have the required role.'),
  500: errorResponse('Unexpected server error.'),
};
const idParameter = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'Announcement UUID. Access is also constrained to the authenticated tenant.',
  schema: { type: 'string', format: 'uuid' },
  example: announcementId,
};
const pageParameters = [
  {
    name: 'page', in: 'query', description: 'One-based page number.',
    schema: { type: 'integer', minimum: 1, default: 1 },
  },
  {
    name: 'limit', in: 'query', description: 'Maximum records per page.',
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
  },
];
const jsonBody = (schema, example) => ({
  required: true,
  content: jsonContent(schema, example),
});
const leader = {
  security: [{ bearerAuth: [] }],
  'x-required-role': 'LEADER',
};
const member = {
  security: [{ bearerAuth: [] }],
  'x-required-role': 'MEMBER',
};

const document = {
  openapi: '3.1.0',
  info: {
    title: 'CrewLink API',
    version: '1.0.0',
    summary: 'Member callout, announcement delivery, and engagement API.',
    description: [
      'CrewLink uses JWT Bearer authentication, role-based authorization, and strict tenant scoping.',
      'Tenant identity always comes from the authenticated database user. Caller-supplied local IDs are ignored or unsupported.',
      '',
      'AI drafting runs either in deterministic offline mock mode or through the server-side OpenRouter provider. AI output is only a draft: a leader must submit and explicitly approve an announcement before sending.',
      '',
      'Sending snapshots eligible members transactionally, records durable outbox intents, and simulates delivery through BullMQ workers. Repeated send calls are idempotent. Read tracking preserves the first read time; acknowledgment is allowed only when enabled and also marks an unread announcement as read. RSVP may be changed between YES, NO, and MAYBE when enabled.',
    ].join('\n'),
  },
  servers: [
    {
      url: '/api',
      description: 'Relative API URL through Nginx (load-balanced across both Express instances).',
    },
  ],
  tags: [
    { name: 'System', description: 'Service health.' },
    { name: 'Authentication', description: 'JWT authentication and current identity.' },
    { name: 'Members', description: 'Tenant-scoped member profile and directory.' },
    { name: 'AI drafting', description: 'Untrusted draft generation requiring human review.' },
    { name: 'Leader announcements', description: 'Leader-only lifecycle, delivery, and reporting.' },
    { name: 'Member inbox', description: 'Member-owned announcements and interactions.' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Check API instance health',
        description: 'Public health endpoint. When called repeatedly through Nginx it can report either API instance.',
        operationId: 'getHealth',
        security: [],
        servers: [{ url: '/', description: 'Health is outside the /api prefix.' }],
        responses: {
          200: response('API is healthy.', ref('HealthResponse')),
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Log in and obtain a JWT',
        description: 'Public endpoint. Use a fictional seeded account, then copy `data.token` into Authorize. Invalid and unknown credentials return the same message.',
        operationId: 'login',
        security: [],
        requestBody: jsonBody(ref('LoginRequest'), {
          email: 'leader27@example.test',
          password: 'CrewLink27Leader!',
        }),
        responses: {
          200: response('Authenticated successfully.', success(ref('AuthResult'))),
          400: standardErrors[400],
          401: errorResponse('Invalid email or password.'),
          500: standardErrors[500],
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Authentication'],
        summary: 'Get the authenticated database identity',
        description: 'Available to LEADER and MEMBER. Token claims are revalidated against the database.',
        operationId: 'getCurrentUser',
        security: [{ bearerAuth: [] }],
        'x-required-role': ['LEADER', 'MEMBER'],
        responses: {
          200: response('Current user.', success(ref('User'))),
          401: standardErrors[401],
          500: standardErrors[500],
        },
      },
    },
    '/members/me': {
      get: {
        ...member,
        tags: ['Members'],
        summary: 'Get the current member profile',
        description: 'Returns only the member profile linked to the authenticated MEMBER user.',
        operationId: 'getOwnMemberProfile',
        responses: {
          200: response('Member profile.', success(ref('Member'))),
          401: standardErrors[401], 403: standardErrors[403],
          404: errorResponse('No member profile is linked to this identity.'),
          500: standardErrors[500],
        },
      },
    },
    '/members': {
      get: {
        ...leader,
        tags: ['Members'],
        summary: 'List members in the leader tenant',
        description: 'The local is derived from the authenticated LEADER; no local ID parameter is accepted.',
        operationId: 'listMembers',
        parameters: [
          ...pageParameters,
          {
            name: 'classification', in: 'query',
            description: 'Exact classification filter, 1–100 characters.',
            schema: { type: 'string', minLength: 1, maxLength: 100 },
            example: 'Transit Operator',
          },
        ],
        responses: {
          200: response('Tenant-scoped member page.', {
            type: 'object', additionalProperties: false,
            required: ['success', 'data', 'pagination'],
            properties: {
              success: { type: 'boolean', const: true },
              data: { type: 'array', items: ref('Member') },
              pagination: ref('OffsetPagination'),
            },
          }),
          400: standardErrors[400], 401: standardErrors[401], 403: standardErrors[403],
          500: standardErrors[500],
        },
      },
    },
    '/ai/draft': {
      post: {
        ...leader,
        tags: ['AI drafting'],
        summary: 'Generate an announcement draft',
        description: 'Uses configured mock or OpenRouter mode. No announcement is created or advanced, and `requiresHumanApproval` is always true.',
        operationId: 'generateAnnouncementDraft',
        requestBody: jsonBody(ref('AiDraftRequest'), {
          topic: 'November membership meeting',
          keyPoints: ['Meeting begins at 6:00 PM', 'Bring membership identification'],
          tone: 'professional',
        }),
        responses: {
          200: response('Generated draft.', success(ref('AiDraft'))),
          400: standardErrors[400], 401: standardErrors[401], 403: standardErrors[403],
          502: errorResponse('The configured AI provider failed or returned invalid output.'),
          504: errorResponse('The OpenRouter request timed out.'),
          500: standardErrors[500],
        },
      },
    },
    '/announcements': {
      get: {
        ...leader,
        tags: ['Leader announcements'],
        summary: 'List announcements in the leader tenant',
        description: 'Tenant scope comes solely from the authenticated LEADER.',
        operationId: 'listAnnouncements',
        parameters: pageParameters,
        responses: {
          200: response('Tenant-scoped announcement page.', {
            type: 'object', additionalProperties: false,
            required: ['success', 'data', 'pagination'],
            properties: {
              success: { type: 'boolean', const: true },
              data: { type: 'array', items: ref('Announcement') },
              pagination: ref('OffsetPagination'),
            },
          }),
          400: standardErrors[400], 401: standardErrors[401], 403: standardErrors[403],
          500: standardErrors[500],
        },
      },
      post: {
        ...leader,
        tags: ['Leader announcements'],
        summary: 'Create a draft announcement',
        description: 'Creates a DRAFT in the authenticated leader tenant. Status, tenant, creator, and approval metadata cannot be supplied by the caller.',
        operationId: 'createAnnouncement',
        requestBody: jsonBody(ref('AnnouncementCreateRequest'), {
          title: 'November membership meeting',
          body: 'The monthly membership meeting begins at 6:00 PM in the union hall.',
          pushPreview: 'Membership meeting at 6:00 PM',
          needsAck: true,
          rsvpEnabled: true,
          classificationFilter: 'Transit Operator',
        }),
        responses: {
          201: response('Draft created.', success(ref('Announcement'))),
          400: standardErrors[400], 401: standardErrors[401], 403: standardErrors[403],
          500: standardErrors[500],
        },
      },
    },
    '/announcements/{id}': {
      parameters: [idParameter],
      get: {
        ...leader,
        tags: ['Leader announcements'],
        summary: 'Get an announcement',
        description: 'Returns 404 for missing or cross-tenant IDs.',
        operationId: 'getAnnouncement',
        responses: {
          200: response('Announcement detail.', success(ref('LeaderAnnouncementDetail'))),
          400: standardErrors[400], 401: standardErrors[401], 403: standardErrors[403],
          404: errorResponse('Announcement not found in this tenant.'),
          500: standardErrors[500],
        },
      },
      patch: {
        ...leader,
        tags: ['Leader announcements'],
        summary: 'Edit a draft announcement',
        description: 'At least one editable field is required. Only DRAFT announcements can be changed.',
        operationId: 'updateAnnouncement',
        requestBody: jsonBody(ref('AnnouncementUpdateRequest'), { pushPreview: 'Updated fictional preview' }),
        responses: {
          200: response('Updated draft.', success(ref('Announcement'))),
          400: standardErrors[400], 401: standardErrors[401], 403: standardErrors[403],
          404: errorResponse('Announcement not found in this tenant.'),
          409: errorResponse('The announcement is no longer editable.'),
          500: standardErrors[500],
        },
      },
    },
    '/announcements/{id}/submit': {
      post: {
        ...leader,
        tags: ['Leader announcements'], parameters: [idParameter],
        summary: 'Submit a draft for approval',
        description: 'Idempotent while already PENDING_APPROVAL. This does not approve or send the announcement.',
        operationId: 'submitAnnouncement',
        responses: {
          200: response('Submitted announcement.', success(ref('Announcement'))),
          400: standardErrors[400], 401: standardErrors[401], 403: standardErrors[403],
          404: errorResponse('Announcement not found in this tenant.'),
          409: errorResponse('Invalid lifecycle transition.'), 500: standardErrors[500],
        },
      },
    },
    '/announcements/{id}/approve': {
      post: {
        ...leader,
        tags: ['Leader announcements'], parameters: [idParameter],
        summary: 'Approve a submitted announcement',
        description: 'Mandatory human approval. Idempotent while already APPROVED; approval identity and time come from the authenticated user and server.',
        operationId: 'approveAnnouncement',
        responses: {
          200: response('Approved announcement.', success(ref('Announcement'))),
          400: standardErrors[400], 401: standardErrors[401], 403: standardErrors[403],
          404: errorResponse('Announcement not found in this tenant.'),
          409: errorResponse('Announcement is not pending approval.'), 500: standardErrors[500],
        },
      },
    },
    '/announcements/{id}/send': {
      post: {
        ...leader,
        tags: ['Leader announcements'], parameters: [idParameter],
        summary: 'Start simulated delivery',
        description: 'Only APPROVED announcements can start. The recipient snapshot and durable outbox are created transactionally. Repeated and concurrent calls are idempotent and never resnapshot later members.',
        operationId: 'sendAnnouncement',
        responses: {
          200: response('The existing send operation is already terminal.', success(ref('SendResult'))),
          202: response('Durable simulated delivery has started or was already in progress.', success(ref('SendResult'))),
          400: standardErrors[400], 401: standardErrors[401], 403: standardErrors[403],
          404: errorResponse('Announcement not found in this tenant.'),
          409: errorResponse('Announcement is not approved or has no eligible recipients.'),
          500: standardErrors[500],
        },
      },
    },
    '/announcements/{id}/status': {
      get: {
        ...leader,
        tags: ['Leader announcements'], parameters: [idParameter],
        summary: 'Get persisted delivery progress',
        description: 'Reports database-backed progress. It never fabricates SENT before the persisted state transition.',
        operationId: 'getAnnouncementSendStatus',
        responses: {
          200: response('Persisted send status.', success(ref('SendStatus'))),
          400: standardErrors[400], 401: standardErrors[401], 403: standardErrors[403],
          404: errorResponse('Announcement not found in this tenant.'),
          500: standardErrors[500],
        },
      },
    },
    '/announcements/{id}/engagement': {
      get: {
        ...leader,
        tags: ['Leader announcements'], parameters: [idParameter],
        summary: 'Get announcement engagement totals',
        description: 'Returns delivery, read, acknowledgment, and RSVP aggregates for this tenant.',
        operationId: 'getAnnouncementEngagement',
        responses: {
          200: response('Engagement report.', success(ref('Engagement'))),
          400: standardErrors[400], 401: standardErrors[401], 403: standardErrors[403],
          404: errorResponse('Announcement not found in this tenant.'),
          500: standardErrors[500],
        },
      },
    },
    '/member/announcements': {
      get: {
        ...member,
        tags: ['Member inbox'],
        summary: 'List announcements addressed to the current member',
        description: 'Cursor-paginated SENT announcements for the member linked to the authenticated identity.',
        operationId: 'listMemberInbox',
        parameters: [
          {
            name: 'limit', in: 'query', description: 'Maximum items.',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
          {
            name: 'cursor', in: 'query', description: 'Opaque `nextCursor` from the previous response.',
            schema: { type: 'string', minLength: 1, maxLength: 500 },
          },
          {
            name: 'read', in: 'query', schema: { type: 'string', enum: ['read', 'unread'] },
          },
          {
            name: 'acknowledgment', in: 'query',
            schema: { type: 'string', enum: ['acknowledged', 'unacknowledged'] },
          },
        ],
        responses: {
          200: response('Member inbox page.', success(ref('MemberInbox'))),
          400: standardErrors[400], 401: standardErrors[401], 403: standardErrors[403],
          404: errorResponse('No member profile is linked to this identity.'),
          500: standardErrors[500],
        },
      },
    },
    '/member/announcements/{id}': {
      get: {
        ...member,
        tags: ['Member inbox'], parameters: [idParameter],
        summary: 'Get an addressed announcement',
        description: 'Only a SENT announcement assigned to the current member is visible; other IDs return 404.',
        operationId: 'getMemberAnnouncement',
        responses: {
          200: response('Member announcement detail.', success(ref('MemberAnnouncementDetail'))),
          400: standardErrors[400], 401: standardErrors[401], 403: standardErrors[403],
          404: errorResponse('No accessible addressed announcement was found.'),
          500: standardErrors[500],
        },
      },
    },
    '/member/announcements/{id}/read': {
      post: {
        ...member,
        tags: ['Member inbox'], parameters: [idParameter],
        summary: 'Mark an announcement as read',
        description: 'Idempotently records the first read timestamp without acknowledging it.',
        operationId: 'markAnnouncementRead',
        responses: {
          200: response('Current interaction state.', success(ref('InteractionState'))),
          400: standardErrors[400], 401: standardErrors[401], 403: standardErrors[403],
          404: errorResponse('No accessible SENT recipient record was found.'),
          500: standardErrors[500],
        },
      },
    },
    '/member/announcements/{id}/acknowledge': {
      post: {
        ...member,
        tags: ['Member inbox'], parameters: [idParameter],
        summary: 'Acknowledge an announcement',
        description: 'Idempotently preserves the first acknowledgment timestamp and marks the announcement read when it was previously unread. An existing first-read timestamp is never overwritten.',
        operationId: 'acknowledgeAnnouncement',
        responses: {
          200: response('Current interaction state.', success(ref('InteractionState'))),
          400: standardErrors[400], 401: standardErrors[401], 403: standardErrors[403],
          404: errorResponse('No accessible SENT recipient record was found.'),
          409: errorResponse('Acknowledgment is not enabled.'),
          500: standardErrors[500],
        },
      },
    },
    '/member/announcements/{id}/rsvp': {
      put: {
        ...member,
        tags: ['Member inbox'], parameters: [idParameter],
        summary: 'Set or change an RSVP response',
        description: 'Stores YES, NO, or MAYBE. Retrying the same value preserves its timestamp; changing the value updates it. RSVP does not change read or acknowledgment state.',
        operationId: 'updateAnnouncementRsvp',
        requestBody: jsonBody(ref('RsvpRequest'), { response: 'YES' }),
        responses: {
          200: response('Current interaction state.', success(ref('InteractionState'))),
          400: standardErrors[400], 401: standardErrors[401], 403: standardErrors[403],
          404: errorResponse('No accessible SENT recipient record was found.'),
          409: errorResponse('RSVP is not enabled.'),
          500: standardErrors[500],
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste only the JWT returned as `data.token` by POST /auth/login.',
      },
    },
    schemas: {
      HealthResponse: {
        type: 'object', additionalProperties: false,
        required: ['status', 'service', 'instance'],
        properties: {
          status: { type: 'string', const: 'ok' },
          service: { type: 'string', const: 'crewlink-api' },
          instance: { type: 'string', examples: ['api-1', 'api-2'] },
        },
      },
      Error: {
        type: 'object', additionalProperties: false,
        required: ['success', 'message'],
        properties: {
          success: { type: 'boolean', const: false },
          message: { type: 'string', example: 'Validation failed' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              required: ['type', 'msg', 'path', 'location'],
              properties: {
                type: { type: 'string', example: 'field' },
                msg: { type: 'string', example: 'Announcement ID must be a valid UUID' },
                path: { type: 'string', example: 'id' },
                location: { type: 'string', enum: ['body', 'params', 'query', 'headers', 'cookies'] },
              },
            },
          },
        },
      },
      LoginRequest: {
        type: 'object', required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', maxLength: 320 },
          password: { type: 'string', format: 'password', minLength: 1, description: 'Maximum 72 UTF-8 bytes.' },
        },
      },
      UserRole: { type: 'string', enum: ['LEADER', 'MEMBER'] },
      User: {
        type: 'object', additionalProperties: false,
        required: ['id', 'localId', 'role', 'email'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          localId: { type: 'string', format: 'uuid' },
          role: ref('UserRole'),
          email: { type: 'string', format: 'email' },
        },
      },
      AuthResult: {
        type: 'object', additionalProperties: false, required: ['token', 'user'],
        properties: {
          token: { type: 'string', description: 'Short-lived HS256 JWT. Do not log or persist it in browser storage.' },
          user: ref('User'),
        },
      },
      MemberStatus: { type: 'string', enum: ['ACTIVE', 'RETIRED', 'SUSPENDED'] },
      Member: {
        type: 'object', additionalProperties: false,
        required: ['id', 'localId', 'fullName', 'email', 'classification', 'status', 'createdAt', 'updatedAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          localId: { type: 'string', format: 'uuid' },
          fullName: { type: 'string', maxLength: 200, example: 'Avery Morgan' },
          email: { type: 'string', format: 'email', example: 'avery.morgan@example.test' },
          classification: { type: 'string', maxLength: 100, example: 'Transit Operator' },
          status: ref('MemberStatus'),
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      OffsetPagination: {
        type: 'object', additionalProperties: false,
        required: ['page', 'limit', 'total', 'pages'],
        properties: {
          page: { type: 'integer', minimum: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
          total: { type: 'integer', minimum: 0 },
          pages: { type: 'integer', minimum: 0 },
        },
      },
      AiDraftRequest: {
        type: 'object', required: ['topic', 'keyPoints'],
        properties: {
          topic: { type: 'string', minLength: 3, maxLength: 200 },
          keyPoints: {
            type: 'array', minItems: 1, maxItems: 12,
            items: { type: 'string', minLength: 1, maxLength: 500 },
          },
          tone: { type: 'string', enum: ['professional', 'concise', 'urgent', 'friendly'] },
          additionalInstructions: { type: 'string', maxLength: 1000 },
        },
      },
      AiDraft: {
        type: 'object', additionalProperties: false,
        required: ['subject', 'body', 'provider', 'model', 'requiresHumanApproval'],
        properties: {
          subject: { type: 'string', minLength: 1, maxLength: 250 },
          body: { type: 'string', maxLength: 10000 },
          provider: { type: 'string', enum: ['mock', 'openrouter'] },
          model: { type: 'string', example: 'preset-template' },
          requiresHumanApproval: { type: 'boolean', const: true },
        },
      },
      AnnouncementStatus: {
        type: 'string', enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENDING', 'SENT', 'FAILED'],
      },
      DeliveryStatus: { type: 'string', enum: ['PENDING', 'PROCESSING', 'SENT', 'FAILED'] },
      RsvpResponse: { type: 'string', enum: ['YES', 'NO', 'MAYBE'] },
      NullableDateTime: { type: ['string', 'null'], format: 'date-time' },
      NullableUuid: { type: ['string', 'null'], format: 'uuid' },
      NullableString: { type: ['string', 'null'] },
      Announcement: {
        type: 'object',
        required: ['id', 'localId', 'createdById', 'title', 'body', 'pushPreview', 'needsAck', 'rsvpEnabled', 'classificationFilter', 'status', 'approvedById', 'approvedAt', 'sentAt', 'createdAt', 'updatedAt'],
        properties: {
          id: { type: 'string', format: 'uuid', example: announcementId },
          localId: { type: 'string', format: 'uuid' },
          createdById: { type: 'string', format: 'uuid' },
          title: { type: 'string', minLength: 1, maxLength: 250 },
          body: { type: 'string', minLength: 1, maxLength: 10000 },
          pushPreview: { type: ['string', 'null'], maxLength: 120 },
          needsAck: { type: 'boolean' },
          rsvpEnabled: { type: 'boolean' },
          classificationFilter: { type: ['string', 'null'], minLength: 1, maxLength: 100 },
          status: ref('AnnouncementStatus'),
          approvedById: ref('NullableUuid'),
          approvedAt: ref('NullableDateTime'),
          sentAt: ref('NullableDateTime'),
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      AnnouncementCreateRequest: {
        type: 'object', required: ['title', 'body'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 250 },
          body: { type: 'string', minLength: 1, maxLength: 10000 },
          pushPreview: { type: ['string', 'null'], maxLength: 120 },
          needsAck: { type: 'boolean', default: false },
          rsvpEnabled: { type: 'boolean', default: false },
          classificationFilter: { type: ['string', 'null'], minLength: 1, maxLength: 100 },
        },
      },
      AnnouncementUpdateRequest: {
        type: 'object', minProperties: 1,
        anyOf: [
          { required: ['title'] },
          { required: ['body'] },
          { required: ['pushPreview'] },
          { required: ['needsAck'] },
          { required: ['rsvpEnabled'] },
          { required: ['classificationFilter'] },
        ],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 250 },
          body: { type: 'string', minLength: 1, maxLength: 10000 },
          pushPreview: { type: ['string', 'null'], maxLength: 120 },
          needsAck: { type: 'boolean' },
          rsvpEnabled: { type: 'boolean' },
          classificationFilter: { type: ['string', 'null'], minLength: 1, maxLength: 100 },
        },
      },
      LeaderAnnouncementDetail: {
        allOf: [
          ref('Announcement'),
          {
            type: 'object', required: ['_count'],
            properties: {
              _count: {
                type: 'object', additionalProperties: false, required: ['recipients'],
                properties: { recipients: { type: 'integer', minimum: 0 } },
              },
            },
          },
        ],
      },
      SendResult: {
        type: 'object',
        required: ['announcementId', 'status', 'alreadyStarted'],
        properties: {
          announcementId: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['SENDING', 'SENT', 'FAILED'] },
          totalRecipients: { type: 'integer', minimum: 1, description: 'Present when this call starts delivery.' },
          alreadyStarted: { type: 'boolean' },
        },
      },
      SendStatus: {
        type: 'object', additionalProperties: false,
        required: ['announcementId', 'status', 'totalRecipients', 'pending', 'completed', 'failed', 'sentAt'],
        properties: {
          announcementId: { type: 'string', format: 'uuid' },
          status: ref('AnnouncementStatus'),
          totalRecipients: { type: 'integer', minimum: 0 },
          pending: { type: 'integer', minimum: 0 },
          completed: { type: 'integer', minimum: 0 },
          failed: { type: 'integer', minimum: 0 },
          sentAt: ref('NullableDateTime'),
        },
      },
      InteractionState: {
        type: 'object', additionalProperties: false,
        required: ['deliveryStatus', 'readAt', 'acknowledgedAt', 'rsvpResponse', 'rsvpUpdatedAt'],
        properties: {
          deliveryStatus: ref('DeliveryStatus'),
          readAt: ref('NullableDateTime'),
          acknowledgedAt: ref('NullableDateTime'),
          rsvpResponse: { oneOf: [ref('RsvpResponse'), { type: 'null' }] },
          rsvpUpdatedAt: ref('NullableDateTime'),
        },
      },
      MemberAnnouncementSummary: {
        type: 'object', additionalProperties: false,
        required: ['id', 'title', 'pushPreview', 'status', 'needsAck', 'rsvpEnabled', 'sentAt', 'createdAt', 'deliveryStatus', 'readAt', 'acknowledgedAt', 'rsvpResponse', 'rsvpUpdatedAt'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          pushPreview: { type: ['string', 'null'] },
          status: { type: 'string', const: 'SENT' },
          needsAck: { type: 'boolean' },
          rsvpEnabled: { type: 'boolean' },
          sentAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          deliveryStatus: ref('DeliveryStatus'),
          readAt: ref('NullableDateTime'),
          acknowledgedAt: ref('NullableDateTime'),
          rsvpResponse: { oneOf: [ref('RsvpResponse'), { type: 'null' }] },
          rsvpUpdatedAt: ref('NullableDateTime'),
        },
      },
      MemberInbox: {
        type: 'object', additionalProperties: false, required: ['items', 'pagination'],
        properties: {
          items: { type: 'array', items: ref('MemberAnnouncementSummary') },
          pagination: {
            type: 'object', additionalProperties: false,
            required: ['limit', 'hasMore', 'nextCursor'],
            properties: {
              limit: { type: 'integer', minimum: 1, maximum: 100 },
              hasMore: { type: 'boolean' },
              nextCursor: { type: ['string', 'null'], description: 'Opaque cursor for the next request.' },
            },
          },
        },
      },
      MemberAnnouncementDetail: {
        type: 'object', additionalProperties: false,
        required: ['id', 'title', 'body', 'pushPreview', 'needsAck', 'rsvpEnabled', 'status', 'sentAt', 'createdAt', 'updatedAt', 'recipient'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' }, body: { type: 'string' },
          pushPreview: { type: ['string', 'null'] },
          needsAck: { type: 'boolean' }, rsvpEnabled: { type: 'boolean' },
          status: { type: 'string', const: 'SENT' },
          sentAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          recipient: ref('InteractionState'),
        },
      },
      RsvpRequest: {
        type: 'object', required: ['response'],
        properties: { response: ref('RsvpResponse') },
      },
      DeliveryTotals: {
        type: 'object', additionalProperties: false, required: ['completed', 'pending', 'failed'],
        properties: {
          completed: { type: 'integer', minimum: 0 }, pending: { type: 'integer', minimum: 0 },
          failed: { type: 'integer', minimum: 0 },
        },
      },
      Engagement: {
        type: 'object', additionalProperties: false,
        required: ['announcementId', 'totalRecipients', 'delivery', 'reads', 'acknowledgments', 'rsvp'],
        properties: {
          announcementId: { type: 'string', format: 'uuid' },
          totalRecipients: { type: 'integer', minimum: 0 },
          delivery: ref('DeliveryTotals'),
          reads: {
            type: 'object', additionalProperties: false, required: ['read', 'unread'],
            properties: { read: { type: 'integer', minimum: 0 }, unread: { type: 'integer', minimum: 0 } },
          },
          acknowledgments: {
            type: 'object', additionalProperties: false,
            required: ['required', 'acknowledged', 'outstanding'],
            properties: {
              required: { type: 'boolean' }, acknowledged: { type: 'integer', minimum: 0 },
              outstanding: { type: 'integer', minimum: 0 },
            },
          },
          rsvp: {
            type: 'object', additionalProperties: false,
            required: ['enabled', 'yes', 'no', 'maybe', 'noResponse'],
            properties: {
              enabled: { type: 'boolean' }, yes: { type: 'integer', minimum: 0 },
              no: { type: 'integer', minimum: 0 }, maybe: { type: 'integer', minimum: 0 },
              noResponse: { type: 'integer', minimum: 0 },
            },
          },
        },
      },
    },
  },
};

module.exports = document;
