import { useLoaderData, useFetcher, useRouteError } from "react-router";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { useAppBridge } from "@shopify/app-bridge-react";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  // Validate Prisma Client
  if (!prisma || typeof prisma.customer === "undefined") {
    console.error("Prisma Client not properly initialized. Customer model not found.");
    throw new Response(
      JSON.stringify({
        error: "Database not initialized",
        message: "Please restart the server after running: npx prisma generate",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    // Get all statistics
    const [
      totalCustomers,
      pendingCount,
      approvedCount,
      rejectedCount,
      recentCustomers,
      todayRegistrations,
      thisWeekRegistrations,
      thisMonthRegistrations,
    ] = await Promise.all([
      prisma.customer.count(),
      prisma.customer.count({ where: { status: "pending" } }),
      prisma.customer.count({ where: { status: "approved" } }),
      prisma.customer.count({ where: { status: "rejected" } }),
      prisma.customer.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
      }),
    prisma.customer.count({
      where: {
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    }),
    prisma.customer.count({
      where: {
        createdAt: {
          gte: new Date(
            new Date().setDate(new Date().getDate() - 7)
          ),
        },
      },
    }),
    prisma.customer.count({
      where: {
        createdAt: {
          gte: new Date(
            new Date().setMonth(new Date().getMonth() - 1)
          ),
        },
      },
    }),
  ]);

  // Get registrations by status over the last 30 days for chart
  const thirtyDaysAgo = new Date(
    new Date().setDate(new Date().getDate() - 30)
  );

  const customersByDate = await prisma.customer.findMany({
    where: {
      createdAt: {
        gte: thirtyDaysAgo,
      },
    },
    select: {
      createdAt: true,
      status: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

    // Group by date
    const registrationsByDate = {};
    customersByDate.forEach((customer) => {
      const date = customer.createdAt.toISOString().split("T")[0];
      if (!registrationsByDate[date]) {
        registrationsByDate[date] = { pending: 0, approved: 0, rejected: 0, total: 0 };
      }
      registrationsByDate[date][customer.status] += 1;
      registrationsByDate[date].total += 1;
    });

    return {
      statistics: {
        total: totalCustomers,
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        today: todayRegistrations,
        thisWeek: thisWeekRegistrations,
        thisMonth: thisMonthRegistrations,
      },
      recentCustomers,
      registrationsByDate,
    };
  } catch (error) {
    console.error("Dashboard loader error:", error);
    throw new Response(
      JSON.stringify({
        error: "Failed to load dashboard data",
        message: error.message,
        hint: "Make sure Prisma Client is generated (npx prisma generate) and the server is restarted",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

export default function Dashboard() {
  const { statistics, recentCustomers, registrationsByDate } = useLoaderData();
  const [searchTerm, setSearchTerm] = useState("");
  const fetcher = useFetcher();
  const shopify = useAppBridge();

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.message || "Action completed successfully");
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleApprove = (customerId) => {
    const notes = prompt("Add notes (optional):");
    fetcher.submit(
      {
        action: "approve",
        customerId,
        notes: notes || "",
      },
      { method: "POST", action: "/app/customers" }
    );
  };

  const handleReject = (customerId) => {
    const notes = prompt("Add rejection notes (optional):");
    fetcher.submit(
      {
        action: "reject",
        customerId,
        notes: notes || "",
      },
      { method: "POST", action: "/app/customers" }
    );
  };

  const filteredRecent = recentCustomers.filter(
    (customer) =>
      !searchTerm ||
      customer.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (customer.company &&
        customer.company.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const isLoading = fetcher.state === "submitting";

  // Calculate approval rate
  const approvalRate =
    statistics.total > 0
      ? ((statistics.approved / statistics.total) * 100).toFixed(1)
      : 0;

  return (
    <s-page heading="Dashboard">
      {/* Statistics Cards */}
      <s-section>
        <s-stack direction="inline" gap="base" wrap>
          <s-box padding="base" borderWidth="base" borderRadius="base" minWidth="200px">
            <s-stack direction="block" gap="small">
              <s-text variant="subdued">Total Customers</s-text>
              <s-heading level="2">{statistics.total}</s-heading>
            </s-stack>
          </s-box>

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
            minWidth="200px"
          >
            <s-stack direction="block" gap="small">
              <s-text variant="subdued">Pending Approval</s-text>
              <s-heading level="2">{statistics.pending}</s-heading>
              <s-link href="/app/customers?status=pending" variant="secondary">
                View all
              </s-link>
            </s-stack>
          </s-box>

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
            minWidth="200px"
          >
            <s-stack direction="block" gap="small">
              <s-text variant="subdued">Approved</s-text>
              <s-heading level="2">{statistics.approved}</s-heading>
              <s-link href="/app/customers?status=approved" variant="secondary">
                View all
              </s-link>
            </s-stack>
          </s-box>

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
            minWidth="200px"
          >
            <s-stack direction="block" gap="small">
              <s-text variant="subdued">Rejected</s-text>
              <s-heading level="2">{statistics.rejected}</s-heading>
              <s-link href="/app/customers?status=rejected" variant="secondary">
                View all
              </s-link>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      {/* Registration Trends */}
      <s-section>
        <s-heading level="2">Registration Trends</s-heading>
        <s-stack direction="inline" gap="base" wrap>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-text variant="subdued">Today</s-text>
              <s-heading level="3">{statistics.today}</s-heading>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-text variant="subdued">This Week</s-text>
              <s-heading level="3">{statistics.thisWeek}</s-heading>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-text variant="subdued">This Month</s-text>
              <s-heading level="3">{statistics.thisMonth}</s-heading>
            </s-stack>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-text variant="subdued">Approval Rate</s-text>
              <s-heading level="3">{approvalRate}%</s-heading>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      {/* Recent Registrations */}
      <s-section>
        <s-stack direction="inline" gap="base" align="space-between">
          <s-heading level="2">Recent Registrations</s-heading>
          <s-link href="/app/customers">View all customers</s-link>
        </s-stack>

        <s-box padding="base" borderWidth="base" borderRadius="base" marginBlockStart="base">
          <s-stack direction="block" gap="base">
            <div>
              <label htmlFor="search" style={{ display: "block", marginBottom: "8px", fontWeight: 500 }}>
                Search
              </label>
              <input
                id="search"
                type="text"
                placeholder="Search by name, email, or company..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "2px solid #e0e0e0",
                  borderRadius: "6px",
                  fontSize: "14px",
                }}
              />
            </div>

            {filteredRecent.length === 0 ? (
              <s-paragraph>
                {searchTerm ? "No customers found matching your search." : "No recent registrations."}
              </s-paragraph>
            ) : (
              <s-stack direction="block" gap="small">
                {filteredRecent.map((customer) => (
                  <s-box
                    key={customer.id}
                    padding="base"
                    borderWidth="base"
                    borderRadius="base"
                    background={
                      customer.status === "pending"
                        ? "subdued"
                        : customer.status === "approved"
                        ? "base"
                        : "base"
                    }
                  >
                    <s-stack direction="block" gap="small">
                      <s-stack direction="inline" gap="base" align="space-between">
                        <div>
                          <s-heading level="4">
                            {customer.firstName} {customer.lastName}
                          </s-heading>
                          <s-text variant="subdued">{customer.email}</s-text>
                          {customer.company && (
                            <s-text variant="subdued"> • {customer.company}</s-text>
                          )}
                        </div>
                        <s-badge
                          variant={
                            customer.status === "approved"
                              ? "success"
                              : customer.status === "rejected"
                              ? "critical"
                              : "attention"
                          }
                        >
                          {customer.status.toUpperCase()}
                        </s-badge>
                      </s-stack>

                      <s-text variant="subdued" size="small">
                        Registered: {new Date(customer.createdAt).toLocaleString()}
                      </s-text>

                      {customer.status === "pending" && (
                        <s-stack direction="inline" gap="base">
                          <s-button
                            variant="primary"
                            size="small"
                            onClick={() => handleApprove(customer.id)}
                            disabled={isLoading}
                          >
                            Approve
                          </s-button>
                          <s-button
                            variant="critical"
                            size="small"
                            onClick={() => handleReject(customer.id)}
                            disabled={isLoading}
                          >
                            Reject
                          </s-button>
                        </s-stack>
                      )}
                    </s-stack>
                  </s-box>
                ))}
              </s-stack>
            )}
          </s-stack>
        </s-box>
      </s-section>

      {/* Quick Actions */}
      <s-section>
        <s-heading level="2">Quick Actions</s-heading>
        <s-stack direction="inline" gap="base">
          <s-button
            onClick={() => {
              window.open("/register", "_blank");
            }}
          >
            View Registration Form
          </s-button>
          <s-button
            variant="secondary"
            onClick={() => {
              window.location.href = "/app/customers?status=pending";
            }}
          >
            Manage Pending Requests
          </s-button>
          <s-button
            variant="secondary"
            onClick={async () => {
              try {
                const response = await fetch("/api/customers");
                const data = await response.json();
                const csv = convertToCSV(data.customers);
                downloadCSV(csv, "customers.csv");
                shopify.toast.show("Export completed");
              } catch (error) {
                shopify.toast.show("Export failed", { isError: true });
              }
            }}
          >
            Export All Customers
          </s-button>
        </s-stack>
      </s-section>
    </s-page>
  );
}

// Helper functions for CSV export
function convertToCSV(customers) {
  const headers = [
    "First Name",
    "Last Name",
    "Email",
    "Phone",
    "Company",
    "Address",
    "City",
    "State",
    "Country",
    "Zip Code",
    "Status",
    "Shopify Customer ID",
    "Notes",
    "Created At",
    "Approved At",
    "Rejected At",
  ];

  const rows = customers.map((customer) => [
    customer.firstName || "",
    customer.lastName || "",
    customer.email || "",
    customer.phone || "",
    customer.company || "",
    customer.address || "",
    customer.city || "",
    customer.state || "",
    customer.country || "",
    customer.zipCode || "",
    customer.status || "",
    customer.shopifyCustomerId || "",
    customer.notes || "",
    customer.createdAt ? new Date(customer.createdAt).toISOString() : "",
    customer.approvedAt ? new Date(customer.approvedAt).toISOString() : "",
    customer.rejectedAt ? new Date(customer.rejectedAt).toISOString() : "",
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  return csvContent;
}

function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
