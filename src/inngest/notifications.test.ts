import { InngestTestEngine } from "@inngest/test";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => {
  const prismaMock = {
    maintenance_requests: { findFirst: vi.fn() },
    property_assignments: { findFirst: vi.fn() },
    property_ownerships: { findFirst: vi.fn() },
    users: { findFirst: vi.fn() },
    notifications_sent: { create: vi.fn() },
  };
  return { prismaMock };
});

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));

const CALLBACK_URL = "https://app.example.com/api/twilio/status";

vi.mock("@/lib/messaging", () => ({
  sendSms: vi.fn(),
  smsStatusCallbackUrl: vi.fn(() => CALLBACK_URL),
  // Deterministic stand-in for the real normalizer: 10-digit US numbers gain
  // a +1 prefix, existing E.164 numbers pass through, anything else is null.
  toE164: vi.fn((phone: string | null | undefined) => {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, "");
    if (phone.trim().startsWith("+")) return digits.length === 11 ? `+${digits}` : null;
    return digits.length === 10 ? `+1${digits}` : null;
  }),
}));

import {
  notifyMaintenanceCreated,
  notifyMaintenanceStatusChanged,
} from "@/inngest/notifications";
import { sendSms } from "@/lib/messaging";

const sendSmsMock = vi.mocked(sendSms);

const SENT = { status: "sent", sid: "SM123", toE164: "+15551230001" } as const;

beforeEach(() => {
  prismaMock.maintenance_requests.findFirst.mockReset().mockResolvedValue(null);
  prismaMock.property_assignments.findFirst.mockReset().mockResolvedValue(null);
  prismaMock.property_ownerships.findFirst.mockReset().mockResolvedValue(null);
  prismaMock.users.findFirst.mockReset().mockResolvedValue(null);
  prismaMock.notifications_sent.create.mockReset().mockResolvedValue({});
  sendSmsMock.mockReset().mockResolvedValue(SENT);
});

describe("notifyMaintenanceCreated", () => {
  const event = {
    name: "maintenance/request.created",
    data: { requestId: "req-1", organizationId: "org-1" },
  };

  function makeEngine() {
    return new InngestTestEngine({
      function: notifyMaintenanceCreated,
      events: [event],
    });
  }

  /**
   * The handler queries maintenance_requests twice: once for title/priority/
   * tenant and once (inside recipient resolution) for the unit's property id.
   * Route on the select shape so ordering doesn't matter.
   */
  function primeRequest(req: {
    title: string;
    priority?: string;
    tenants?: { first_name?: string | null; last_name?: string | null } | null;
  }) {
    prismaMock.maintenance_requests.findFirst.mockImplementation(
      async (args: { select?: { units?: unknown } }) => {
        if (args?.select?.units) return { units: { property_id: "prop-1" } };
        return {
          title: req.title,
          priority: req.priority ?? "normal",
          tenants: req.tenants ?? null,
        };
      },
    );
  }

  function primeAssignments(records: {
    staff?: { phone: string; first_name?: string; last_name?: string } | null;
    pm?: { phone: string; first_name?: string; last_name?: string } | null;
  }) {
    prismaMock.property_assignments.findFirst.mockImplementation(
      async (args: { where?: { users?: { role?: string } } }) => {
        const role = args?.where?.users?.role;
        if (role === "maintenance_staff") {
          return records.staff ? { users: records.staff } : null;
        }
        if (role === "property_manager") {
          return records.pm ? { users: records.pm } : null;
        }
        return null;
      },
    );
  }

  test("returns skipped when the request does not exist, without texting or logging", async () => {
    const { result, error } = await makeEngine().execute();

    expect(error).toBeUndefined();
    expect(result).toEqual({ skipped: "request_not_found" });
    expect(sendSmsMock).not.toHaveBeenCalled();
    expect(prismaMock.notifications_sent.create).not.toHaveBeenCalled();
  });

  test("texts the assigned maintenance staff first and logs the sent notification", async () => {
    primeRequest({
      title: "Leaky faucet",
      tenants: { first_name: "Jane", last_name: "Doe" },
    });
    primeAssignments({
      staff: { phone: "5551230001", first_name: "Sam", last_name: "Fixer" },
    });

    const { result } = await makeEngine().execute();

    const expectedBody =
      'New maintenance request: "Leaky faucet" submitted by Jane Doe.';
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    expect(sendSmsMock).toHaveBeenCalledWith({
      to: "+15551230001",
      body: expectedBody,
      statusCallback: CALLBACK_URL,
    });
    expect(result).toEqual(SENT);
    expect(prismaMock.notifications_sent.create).toHaveBeenCalledWith({
      data: {
        organization_id: "org-1",
        tenant_id: null,
        channel: "sms",
        recipient_type: "maintenance_staff",
        to_phone: "+15551230001",
        body: expectedBody,
        provider_sid: "SM123",
        status: "sent",
        error_reason: null,
        related_type: "maintenance_request",
        related_id: "req-1",
      },
    });
    // Lower tiers are never queried once tier 1 resolves.
    expect(prismaMock.property_ownerships.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.users.findFirst).not.toHaveBeenCalled();
  });

  test("flags emergencies in the body and falls back to 'a tenant' when unnamed", async () => {
    primeRequest({ title: "Burst pipe", priority: "emergency", tenants: null });
    primeAssignments({ staff: { phone: "5551230001" } });

    await makeEngine().execute();

    expect(sendSmsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'New maintenance request (EMERGENCY): "Burst pipe" submitted by a tenant.',
      }),
    );
  });

  test("skips a tier whose phone cannot be normalized and escalates to the next", async () => {
    primeRequest({ title: "Leaky faucet" });
    primeAssignments({
      staff: { phone: "not-a-number" },
      pm: { phone: "5551230002", first_name: "Pat", last_name: "Manager" },
    });

    await makeEngine().execute();

    expect(sendSmsMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+15551230002" }),
    );
    expect(prismaMock.notifications_sent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipient_type: "property_manager",
        to_phone: "+15551230002",
      }),
    });
  });

  test("escalates through staff, manager, and owner to the org admin", async () => {
    primeRequest({ title: "Leaky faucet" });
    // No assignments, no ownership (defaults resolve null); admin exists.
    prismaMock.users.findFirst.mockResolvedValue({
      phone: "5551230009",
      first_name: "Ada",
      last_name: "Admin",
    });

    await makeEngine().execute();

    const assignmentRoles = prismaMock.property_assignments.findFirst.mock.calls.map(
      (call) => (call[0] as { where: { users: { role: string } } }).where.users.role,
    );
    expect(assignmentRoles).toEqual(["maintenance_staff", "property_manager"]);
    expect(prismaMock.property_ownerships.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.users.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organization_id: "org-1",
          role: "admin",
          is_active: true,
        }),
      }),
    );
    expect(sendSmsMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+15551230009" }),
    );
    expect(prismaMock.notifications_sent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ recipient_type: "admin" }),
    });
  });

  test("logs a skipped row with an empty phone when no recipient is reachable", async () => {
    primeRequest({ title: "Leaky faucet" });

    const { result } = await makeEngine().execute();

    expect(result).toEqual({ skipped: "no_recipient" });
    expect(sendSmsMock).not.toHaveBeenCalled();
    expect(prismaMock.notifications_sent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipient_type: null,
        to_phone: "",
        status: "skipped",
        provider_sid: null,
        error_reason: null,
        related_type: "maintenance_request",
        related_id: "req-1",
      }),
    });
  });

  test("logs a failed send with its reason and resolves (no retry is triggered)", async () => {
    primeRequest({ title: "Leaky faucet" });
    primeAssignments({ staff: { phone: "5551230001" } });
    sendSmsMock.mockResolvedValue({ status: "failed", reason: "twilio 500" });

    const { result, error } = await makeEngine().execute();

    // Pins current behavior: a transient Twilio failure is logged but the
    // function still resolves successfully, so Inngest never retries it.
    expect(error).toBeUndefined();
    expect(result).toEqual({ status: "failed", reason: "twilio 500" });
    expect(prismaMock.notifications_sent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "failed",
        error_reason: "twilio 500",
        provider_sid: null,
      }),
    });
  });

  test("a notifications_sent write failure never breaks the flow", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      primeRequest({ title: "Leaky faucet" });
      primeAssignments({ staff: { phone: "5551230001" } });
      prismaMock.notifications_sent.create.mockRejectedValue(new Error("db down"));

      const { result, error } = await makeEngine().execute();

      expect(error).toBeUndefined();
      expect(result).toEqual(SENT);
      expect(consoleError).toHaveBeenCalledWith(
        "[notifications] failed to write notifications_sent",
        expect.any(Error),
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("notifyMaintenanceStatusChanged", () => {
  function makeEngine(data: Record<string, unknown>) {
    return new InngestTestEngine({
      function: notifyMaintenanceStatusChanged,
      events: [
        {
          name: "maintenance/status.changed",
          data: { requestId: "req-1", organizationId: "org-1", ...data },
        },
      ],
    });
  }

  function primeTenantRequest(phone: string | null) {
    prismaMock.maintenance_requests.findFirst.mockResolvedValue({
      title: "Leaky faucet",
      tenants: { id: "tenant-1", phone },
    });
  }

  test("returns skipped when the request (or its tenant) is missing", async () => {
    const { result } = await makeEngine({ toStatus: "in_progress" }).execute();

    expect(result).toEqual({ skipped: "no_tenant" });
    expect(sendSmsMock).not.toHaveBeenCalled();
    expect(prismaMock.notifications_sent.create).not.toHaveBeenCalled();
  });

  test("logs a skipped row and returns invalid_phone when the tenant phone is unusable", async () => {
    primeTenantRequest("bogus");

    const { result } = await makeEngine({ toStatus: "in_progress" }).execute();

    expect(result).toEqual({ skipped: "invalid_phone" });
    expect(sendSmsMock).not.toHaveBeenCalled();
    expect(prismaMock.notifications_sent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenant_id: "tenant-1",
        recipient_type: "tenant",
        to_phone: "bogus",
        status: "skipped",
        related_type: "maintenance_request",
        related_id: "req-1",
      }),
    });
  });

  test("texts the tenant on their normalized number and logs the sent row", async () => {
    primeTenantRequest("5559990001");

    const { result } = await makeEngine({
      toStatus: "in_progress",
      note: "Plumber arrives at 2pm.",
    }).execute();

    const expectedBody =
      'Your maintenance request "Leaky faucet" is now in progress. Plumber arrives at 2pm.';
    expect(sendSmsMock).toHaveBeenCalledWith({
      to: "+15559990001",
      body: expectedBody,
      statusCallback: CALLBACK_URL,
    });
    expect(result).toEqual(SENT);
    expect(prismaMock.notifications_sent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenant_id: "tenant-1",
        recipient_type: "tenant",
        to_phone: "+15559990001",
        body: expectedBody,
        provider_sid: "SM123",
        status: "sent",
      }),
    });
  });

  test.each([
    ["in_progress", 'Your maintenance request "Leaky faucet" is now in progress.'],
    [
      "pending_acceptance",
      'Work on your maintenance request "Leaky faucet" is complete — please confirm it in the app.',
    ],
    ["completed", 'Your maintenance request "Leaky faucet" has been completed.'],
    ["rejected", 'Your maintenance request "Leaky faucet" has been closed.'],
    ["some_unknown_status", 'Update on your maintenance request "Leaky faucet".'],
  ])("builds the %s message body", async (toStatus, expectedBody) => {
    primeTenantRequest("5559990001");

    await makeEngine({ toStatus }).execute();

    expect(sendSmsMock).toHaveBeenCalledWith(
      expect.objectContaining({ body: expectedBody }),
    );
  });

  test("ignores a whitespace-only note", async () => {
    primeTenantRequest("5559990001");

    await makeEngine({ toStatus: "completed", note: "   " }).execute();

    expect(sendSmsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Your maintenance request "Leaky faucet" has been completed.',
      }),
    );
  });
});
