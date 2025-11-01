import { useLoaderData, useFetcher, useRouteError } from "react-router";
import { useEffect, useRef, useState } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { useAppBridge } from "@shopify/app-bridge-react";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

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
    const url = new URL(request.url);
    const statusParam = url.searchParams.get("status");
    const searchParam = url.searchParams.get("search");
    const status = statusParam || "all";

    const whereClause = status === "all" ? {} : { status };

    // Add search filter
    if (searchParam && searchParam.trim()) {
      // Make search case-insensitive by default if your Prisma provider supports it, otherwise this is a lexical match
      whereClause.OR = [
        { firstName: { contains: searchParam } },
        { lastName: { contains: searchParam } },
        { email: { contains: searchParam } },
        { phone: { contains: searchParam } },
        { company: { contains: searchParam } },
      ];
    }

    const customers = await prisma.customer.findMany({
      where: whereClause,
      orderBy: {
        createdAt: "desc",
      },
    });

    // Fetch order data and email subscription from Shopify for approved customers
    const customersWithStats = await Promise.all(
      customers.map(async (customer) => {
        let orderCount = 0;
        let totalSpent = 0;
        let emailSubscribed = false;

        let currencyCode = "USD"; // Default currency

        if (customer.shopifyCustomerId && customer.status === "approved") {
          try {
            // Fetch customer from Shopify to get email subscription and orders
            const customerGid = `gid://shopify/Customer/${customer.shopifyCustomerId}`;

            const customerResponse = await admin.graphql(
              `#graphql
                query getCustomer($id: ID!) {
                  customer(id: $id) {
                    id
                    emailMarketingConsent {
                      marketingState
                      marketingOptInLevel
                    }
                    ordersCount
                    totalSpent {
                      amount
                      currencyCode
                    }
                  }
                }`,
              {
                variables: { id: customerGid },
              }
            );

            const customerData = await customerResponse.json();

            if (customerData.data?.customer) {
              orderCount = customerData.data.customer.ordersCount || 0;
              totalSpent = parseFloat(customerData.data.customer.totalSpent?.amount || "0");
              currencyCode = customerData.data.customer.totalSpent?.currencyCode || "USD";
              emailSubscribed =
                customerData.data.customer.emailMarketingConsent?.marketingState === "SUBSCRIBED";
            }
          } catch (error) {
            console.error(`Error fetching Shopify data for customer ${customer.id}:`, error);
            // Continue with default values if fetch fails
          }
        }

        return {
          ...customer,
          orderCount,
          totalSpent,
          currencyCode,
          emailSubscribed,
        };
      })
    );

    // Get counts for each status
    const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
      prisma.customer.count({ where: { status: "pending" } }),
      prisma.customer.count({ where: { status: "approved" } }),
      prisma.customer.count({ where: { status: "rejected" } }),
    ]);

    return {
      customers: customersWithStats,
      status,
      search: searchParam || "",
      pendingCount,
      approvedCount,
      rejectedCount,
    };
  } catch (error) {
    console.error("Customers loader error:", error);
    throw new Response(
      JSON.stringify({
        error: "Failed to load customers",
        message: error.message,
        hint: "Make sure Prisma Client is generated (npx prisma generate)",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");
  const customerId = formData.get("customerId")?.toString();
  const notes = formData.get("notes")?.toString();

  if (!customerId || !action) {
    return { error: "Invalid request", success: false };
  }

  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return { error: "Customer not found", success: false };
    }

    if (action === "approve") {
      // Create customer in Shopify
      const shopifyCustomerResponse = await admin.graphql(
        `#graphql
          mutation customerCreate($input: CustomerInput!) {
            customerCreate(input: $input) {
              customer {
                id
                email
                firstName
                lastName
                phone
              }
              userErrors {
                field
                message
              }
            }
          }`,
        {
          variables: {
            input: {
              email: customer.email,
              firstName: customer.firstName,
              lastName: customer.lastName,
              phone: customer.phone || undefined,
              addresses: customer.address
                ? [
                    {
                      address1: customer.address,
                      city: customer.city || undefined,
                      province: customer.state || undefined,
                      country: customer.country || undefined,
                      zip: customer.zipCode || undefined,
                    },
                  ]
                : undefined,
              note: notes || undefined,
            },
          },
        }
      );

      const shopifyResponse = await shopifyCustomerResponse.json();

      if (shopifyResponse.data.customerCreate.userErrors?.length > 0) {
        return {
          error: shopifyResponse.data.customerCreate.userErrors[0].message,
          success: false,
        };
      }

      // Extract customer ID from GID format (gid://shopify/Customer/123456)
      const shopifyCustomerGid = shopifyResponse.data.customerCreate.customer?.id;
      const shopifyCustomerId = shopifyCustomerGid ? shopifyCustomerGid.split("/").pop() : null;

      // Update customer status
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          status: "approved",
          shopifyCustomerId: shopifyCustomerId || null,
          approvedAt: new Date(),
          approvedBy: session.shop,
          notes: notes || customer.notes,
        },
      });

      return {
        success: true,
        message: "Customer approved and created in Shopify successfully",
      };
    } else if (action === "reject") {
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          status: "rejected",
          rejectedAt: new Date(),
          approvedBy: session.shop,
          notes: notes || customer.notes,
        },
      });

      return {
        success: true,
        message: "Customer registration rejected",
      };
    }

    return { error: "Invalid action", success: false };
  } catch (error) {
    console.error("Customer action error:", error);
    return {
      error: "An error occurred. Please try again.",
      success: false,
    };
  }
};

const COLUMN_DEFINITIONS = {
  select: { label: "Select", key: "select", defaultVisible: true, required: true },
  firstName: { label: "First Name", key: "firstName", defaultVisible: true },
  lastName: { label: "Last Name", key: "lastName", defaultVisible: true },
  email: { label: "Email", key: "email", defaultVisible: true },
  phone: { label: "Phone", key: "phone", defaultVisible: true },
  company: { label: "Company", key: "company", defaultVisible: true },
  address: { label: "Address", key: "address", defaultVisible: true },
  city: { label: "City", key: "city", defaultVisible: true },
  state: { label: "State", key: "state", defaultVisible: true },
  country: { label: "Country", key: "country", defaultVisible: true },
  zipCode: { label: "Zip Code", key: "zipCode", defaultVisible: true },
  status: { label: "Status", key: "status", defaultVisible: true, required: true },
  orderCount: { label: "Orders Count", key: "orderCount", defaultVisible: true },
  totalSpent: { label: "Total Spent", key: "totalSpent", defaultVisible: true },
  currency: { label: "Currency", key: "currency", defaultVisible: true },
  shopifyCustomerId: { label: "Shopify Customer ID", key: "shopifyCustomerId", defaultVisible: false },
  notes: { label: "Notes", key: "notes", defaultVisible: true },
  actions: { label: "Actions", key: "actions", defaultVisible: true, required: true },
};

export default function Customers() {
  const { customers, status, search, pendingCount, approvedCount, rejectedCount } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [selectedCustomers, setSelectedCustomers] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState(search || "");

  // Use ref to detect clicks outside the filter popup
  const columnFilterRef = useRef(null);

  // Build default visibility map from COLUMN_DEFINITIONS
  const buildDefaultVisibility = () => {
    const defaults = {};
    Object.keys(COLUMN_DEFINITIONS).forEach((key) => {
      defaults[key] = COLUMN_DEFINITIONS[key].defaultVisible;
    });
    return defaults;
  };

  // Initialize with defaults (safe for SSR), then hydrate from localStorage on client
  const [columnVisibility, setColumnVisibility] = useState(buildDefaultVisibility);
  const [showColumnFilter, setShowColumnFilter] = useState(false);

  // Hydrate column visibility from localStorage on client only
  useEffect(() => {
    try {
      const saved = localStorage.getItem("customerColumnsVisibility");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to avoid missing keys
        setColumnVisibility((prev) => ({ ...prev, ...parsed }));
      }
    } catch (e) {
      console.error("Error loading column preferences:", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist column visibility to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem("customerColumnsVisibility", JSON.stringify(columnVisibility));
    } catch (e) {
      console.error("Error saving column preferences:", e);
    }
  }, [columnVisibility]);

  // Close column filter when clicking outside using ref
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showColumnFilter && columnFilterRef.current && !columnFilterRef.current.contains(event.target)) {
        setShowColumnFilter(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showColumnFilter]);

  useEffect(() => {
    if (fetcher.data?.success) {
      // show toast and reload
      try {
        shopify.toast.show(fetcher.data.message || "Action completed successfully");
      } catch (e) {
        console.warn("Toast failed:", e);
      }
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else if (fetcher.data?.error) {
      try {
        shopify.toast.show(fetcher.data.error, { isError: true });
      } catch (e) {
        console.warn("Toast failed:", e);
      }
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
      { method: "POST" }
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
      { method: "POST" }
    );
  };

  const handleSelectAll = () => {
    if (selectedCustomers.size === customers.length) {
      setSelectedCustomers(new Set());
    } else {
      setSelectedCustomers(new Set(customers.map((c) => c.id)));
    }
  };

  const handleSelectCustomer = (customerId) => {
    const newSelected = new Set(selectedCustomers);
    if (newSelected.has(customerId)) {
      newSelected.delete(customerId);
    } else {
      newSelected.add(customerId);
    }
    setSelectedCustomers(newSelected);
  };

  const formatCurrency = (amount, currencyCode = "USD") => {
    if (amount === null || amount === undefined || isNaN(Number(amount))) return "—";

    const numeric = Number(amount);
    const formattedAmount = Math.abs(numeric).toFixed(2);

    const currencySymbols = {
      USD: "$",
      EUR: "€",
      GBP: "£",
      JPY: "¥",
      INR: "₹",
      AUD: "A$",
      CAD: "C$",
      CHF: "CHF ",
      CNY: "¥",
      SEK: "kr ",
      NZD: "NZ$",
    };

    const symbol = currencySymbols[currencyCode] || `${currencyCode} `;

    if (currencyCode === "LKR" || currencyCode.toLowerCase().includes("rs")) {
      return `Rs ${formattedAmount}`;
    }

    return `${symbol}${formattedAmount}`;
  };

  const isLoading = fetcher.state === "submitting";

  const handleExportCSV = () => {
    try {
      const customersToExport =
        selectedCustomers.size > 0 ? customers.filter((c) => selectedCustomers.has(c.id)) : customers;

      if (customersToExport.length === 0) {
        try {
          shopify.toast.show("No customers to export", { isError: true });
        } catch (e) {
          console.warn("Toast failed:", e);
        }
        return;
      }

      const csv = convertToCSV(customersToExport);
      const filename =
        selectedCustomers.size > 0
          ? `customers-selected-${new Date().toISOString().split("T")[0]}.csv`
          : `customers-${status === "all" ? "all" : status}-${new Date().toISOString().split("T")[0]}.csv`;

      downloadCSV(csv, filename);
      try {
        shopify.toast.show(`Exported ${customersToExport.length} customer(s) successfully`);
      } catch (e) {
        console.warn("Toast failed:", e);
      }
    } catch (error) {
      console.error("Export error:", error);
      try {
        shopify.toast.show("Export failed", { isError: true });
      } catch (e) {
        console.warn("Toast failed:", e);
      }
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const url = new URL(window.location.href);
    if (searchTerm.trim()) {
      url.searchParams.set("search", searchTerm.trim());
    } else {
      url.searchParams.delete("search");
    }
    window.location.href = url.toString();
  };

  const clearSearch = () => {
    setSearchTerm("");
    const url = new URL(window.location.href);
    url.searchParams.delete("search");
    window.location.href = url.toString();
  };

  // Toggle column visibility. Prevent hiding required columns.
  const toggleColumnVisibility = (columnKey) => {
    if (COLUMN_DEFINITIONS[columnKey]?.required) {
      return;
    }

    setColumnVisibility((prev) => {
      const newVisibility = {
        ...prev,
        [columnKey]: !Boolean(prev[columnKey]),
      };
      return newVisibility;
    });
  };

  const resetColumns = () => {
    const defaults = buildDefaultVisibility();
    setColumnVisibility(defaults);
    try {
      localStorage.setItem("customerColumnsVisibility", JSON.stringify(defaults));
    } catch (e) {
      console.error("Error saving column preferences:", e);
    }
  };

  // Resolve whether a column is visible, falling back to default
  const isColumnVisible = (columnKey) => {
    if (Object.prototype.hasOwnProperty.call(columnVisibility, columnKey)) {
      return Boolean(columnVisibility[columnKey]);
    }
    return Boolean(COLUMN_DEFINITIONS[columnKey]?.defaultVisible);
  };

  return (
    <>
      <style>{`
        /* Make app container full width */
        :host {
          width: 100% !important;
          max-width: 100% !important;
        }
        s-page {
          width: 100% !important;
          max-width: 100% !important;
          display: block !important;
        }
        s-page::part(container),
        s-page [part="container"] {
          width: 100% !important;
          max-width: 100% !important;
        }
        s-section {
          width: 100% !important;
          max-width: 100% !important;
          display: block !important;
        }
        s-section::part(container),
        s-section [part="container"] {
          width: 100% !important;
          max-width: 100% !important;
        }
        s-box {
          width: 100% !important;
          max-width: 100% !important;
        }
        /* Ensure table container uses full width */
        [data-full-width] {
          width: 100% !important;
          max-width: 100% !important;
        }
        /* Override any Polaris container constraints */
        .Polaris-Page,
        [class*="Polaris-Page"],
        [class*="Polaris-Layout"],
        [class*="Container"] {
          width: 100% !important;
          max-width: 100% !important;
        }
      `}</style>
      <s-page heading="Customers" style={{ width: "100%", maxWidth: "100%", display: "block" }}>
        <s-section style={{ width: "100%", maxWidth: "100%", display: "block" }}>
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="base" align="start">
              <s-link href="/app/customers?status=pending" variant={status === "pending" ? "primary" : "secondary"}>
                Pending ({pendingCount})
              </s-link>
              <s-link href="/app/customers?status=approved" variant={status === "approved" ? "primary" : "secondary"}>
                Approved ({approvedCount})
              </s-link>
              <s-link href="/app/customers?status=rejected" variant={status === "rejected" ? "primary" : "secondary"}>
                Rejected ({rejectedCount})
              </s-link>
              <s-link href="/app/customers" variant={status === "all" ? "primary" : "secondary"}>
                All ({pendingCount + approvedCount + rejectedCount})
              </s-link>
            </s-stack>

            <s-stack direction="inline" gap="base" align="space-between">
              <form
                onSubmit={handleSearch}
                style={{ display: "flex", gap: "8px", flex: 1, maxWidth: "400px", minWidth: "300px" }}
              >
                <input
                  type="text"
                  placeholder="Search by name, email, phone, or company..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    border: "1px solid #e1e3e5",
                    borderRadius: "6px",
                    fontSize: "14px",
                  }}
                />
                <s-button type="submit" variant="secondary">
                  Search
                </s-button>
                {search && (
                  <s-button type="button" variant="tertiary" onClick={clearSearch}>
                    Clear
                  </s-button>
                )}
              </form>
              <s-stack direction="inline" gap="base">
                {customers.length > 0 && (
                  <>
                    <div style={{ position: "relative" }} ref={columnFilterRef}>
                      <s-button variant="secondary" onClick={() => setShowColumnFilter((s) => !s)}>
                        Columns
                      </s-button>
                      {showColumnFilter && (
                        <div
                          style={{
                            position: "absolute",
                            top: "100%",
                            right: 0,
                            marginTop: "8px",
                            backgroundColor: "white",
                            border: "1px solid #e1e3e5",
                            borderRadius: "6px",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                            padding: "12px",
                            zIndex: 1000,
                            minWidth: "250px",
                            maxHeight: "400px",
                            overflowY: "auto",
                          }}
                        >
                          <s-stack direction="block" gap="small">
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "8px",
                              }}
                            >
                              <s-text variant="bodyMd" fontWeight="semibold">
                                Show/Hide Columns
                              </s-text>
                              <s-button variant="tertiary" size="small" onClick={resetColumns}>
                                Reset
                              </s-button>
                            </div>
                            {Object.entries(COLUMN_DEFINITIONS).map(([key, col]) => (
                              <label
                                key={key}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  padding: "6px 0",
                                  cursor: col.required ? "not-allowed" : "pointer",
                                  opacity: col.required ? 0.6 : 1,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={Boolean(isColumnVisible(key))}
                                  onChange={() => toggleColumnVisibility(key)}
                                  disabled={col.required}
                                  style={{ cursor: col.required ? "not-allowed" : "pointer" }}
                                />
                                <span style={{ fontSize: "14px" }}>{col.label}</span>
                                {col.required && (
                                  <span style={{ fontSize: "11px", color: "#999" }}>(Required)</span>
                                )}
                              </label>
                            ))}
                          </s-stack>
                        </div>
                      )}
                    </div>
                    <s-button variant="secondary" onClick={handleExportCSV}>
                      {selectedCustomers.size > 0 ? `Export Selected (${selectedCustomers.size})` : "Export CSV"}
                    </s-button>
                  </>
                )}
              </s-stack>
            </s-stack>
          </s-stack>
        </s-section>

        {customers.length === 0 ? (
          <s-section>
            <s-paragraph>
              No {status !== "all" ? status : ""} customer registrations found.
              <br />
              <s-link href="/register" target="_blank">
                View Registration Form
              </s-link>
            </s-paragraph>
          </s-section>
        ) : (
          <s-section style={{ width: "100%", maxWidth: "100%", display: "block" }}>
            <s-box
              padding="none"
              borderWidth="base"
              borderRadius="base"
              background="base"
              style={{ width: "100%", maxWidth: "100%", display: "block" }}
            >
              <div style={{ overflowX: "auto", width: "100%", display: "block" }} data-full-width>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "14px",
                    minWidth: "1400px",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        borderBottom: "1px solid #e1e3e5",
                        backgroundColor: "#fafbfb",
                      }}
                    >
                      <th
                        style={{
                          padding: "12px 16px",
                          textAlign: "left",
                          fontWeight: "600",
                          color: "#202223",
                          fontSize: "13px",
                          borderBottom: "1px solid #e1e3e5",
                          position: "sticky",
                          left: 0,
                          backgroundColor: "#fafbfb",
                          zIndex: 1,
                        }}
                      >
                        <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={selectedCustomers.size === customers.length && customers.length > 0}
                            onChange={handleSelectAll}
                            style={{ marginRight: "8px", cursor: "pointer" }}
                          />
                          Select
                        </label>
                      </th>
                      {isColumnVisible("firstName") && (
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontWeight: "600",
                            color: "#202223",
                            fontSize: "13px",
                            borderBottom: "1px solid #e1e3e5",
                          }}
                        >
                          First Name
                        </th>
                      )}
                      {isColumnVisible("lastName") && (
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontWeight: "600",
                            color: "#202223",
                            fontSize: "13px",
                            borderBottom: "1px solid #e1e3e5",
                          }}
                        >
                          Last Name
                        </th>
                      )}
                      {isColumnVisible("email") && (
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontWeight: "600",
                            color: "#202223",
                            fontSize: "13px",
                            borderBottom: "1px solid #e1e3e5",
                          }}
                        >
                          Email
                        </th>
                      )}
                      {isColumnVisible("phone") && (
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontWeight: "600",
                            color: "#202223",
                            fontSize: "13px",
                            borderBottom: "1px solid #e1e3e5",
                          }}
                        >
                          Phone
                        </th>
                      )}
                      {isColumnVisible("company") && (
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontWeight: "600",
                            color: "#202223",
                            fontSize: "13px",
                            borderBottom: "1px solid #e1e3e5",
                          }}
                        >
                          Company
                        </th>
                      )}
                      {isColumnVisible("address") && (
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontWeight: "600",
                            color: "#202223",
                            fontSize: "13px",
                            borderBottom: "1px solid #e1e3e5",
                          }}
                        >
                          Address
                        </th>
                      )}
                      {isColumnVisible("city") && (
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontWeight: "600",
                            color: "#202223",
                            fontSize: "13px",
                            borderBottom: "1px solid #e1e3e5",
                          }}
                        >
                          City
                        </th>
                      )}
                      {isColumnVisible("state") && (
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontWeight: "600",
                            color: "#202223",
                            fontSize: "13px",
                            borderBottom: "1px solid #e1e3e5",
                          }}
                        >
                          State
                        </th>
                      )}
                      {isColumnVisible("country") && (
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontWeight: "600",
                            color: "#202223",
                            fontSize: "13px",
                            borderBottom: "1px solid #e1e3e5",
                          }}
                        >
                          Country
                        </th>
                      )}
                      {isColumnVisible("zipCode") && (
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontWeight: "600",
                            color: "#202223",
                            fontSize: "13px",
                            borderBottom: "1px solid #e1e3e5",
                          }}
                        >
                          Zip Code
                        </th>
                      )}
                      {isColumnVisible("status") && (
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontWeight: "600",
                            color: "#202223",
                            fontSize: "13px",
                            borderBottom: "1px solid #e1e3e5",
                          }}
                        >
                          Status
                        </th>
                      )}
                      {isColumnVisible("orderCount") && (
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontWeight: "600",
                            color: "#202223",
                            fontSize: "13px",
                            borderBottom: "1px solid #e1e3e5",
                          }}
                        >
                          Orders Count
                        </th>
                      )}
                      {isColumnVisible("totalSpent") && (
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontWeight: "600",
                            color: "#202223",
                            fontSize: "13px",
                            borderBottom: "1px solid #e1e3e5",
                          }}
                        >
                          Total Spent
                        </th>
                      )}
                      {isColumnVisible("currency") && (
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontWeight: "600",
                            color: "#202223",
                            fontSize: "13px",
                            borderBottom: "1px solid #e1e3e5",
                          }}
                        >
                          Currency
                        </th>
                      )}
                      {isColumnVisible("shopifyCustomerId") && (
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontWeight: "600",
                            color: "#202223",
                            fontSize: "13px",
                            borderBottom: "1px solid #e1e3e5",
                          }}
                        >
                          Shopify Customer ID
                        </th>
                      )}
                      {isColumnVisible("notes") && (
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontWeight: "600",
                            color: "#202223",
                            fontSize: "13px",
                            borderBottom: "1px solid #e1e3e5",
                          }}
                        >
                          Notes
                        </th>
                      )}
                      {status === "pending" && isColumnVisible("actions") && (
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "left",
                            fontWeight: "600",
                            color: "#202223",
                            fontSize: "13px",
                            borderBottom: "1px solid #e1e3e5",
                          }}
                        >
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((customer) => (
                      <tr
                        key={customer.id}
                        style={{
                          borderBottom: "1px solid #e1e3e5",
                          backgroundColor: "white",
                        }}
                      >
                        <td
                          style={{
                            padding: "12px 16px",
                            color: "#202223",
                            position: "sticky",
                            left: 0,
                            backgroundColor: "white",
                            zIndex: 0,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedCustomers.has(customer.id)}
                            onChange={() => handleSelectCustomer(customer.id)}
                            style={{ cursor: "pointer" }}
                          />
                        </td>
                        {isColumnVisible("firstName") && (
                          <td style={{ padding: "12px 16px", color: "#202223" }}>{customer.firstName || "—"}</td>
                        )}
                        {isColumnVisible("lastName") && (
                          <td style={{ padding: "12px 16px", color: "#202223" }}>{customer.lastName || "—"}</td>
                        )}
                        {isColumnVisible("email") && (
                          <td style={{ padding: "12px 16px", color: "#202223" }}>{customer.email || "—"}</td>
                        )}
                        {isColumnVisible("phone") && (
                          <td style={{ padding: "12px 16px", color: "#202223" }}>{customer.phone || "—"}</td>
                        )}
                        {isColumnVisible("company") && (
                          <td style={{ padding: "12px 16px", color: "#202223" }}>{customer.company || "—"}</td>
                        )}
                        {isColumnVisible("address") && (
                          <td style={{ padding: "12px 16px", color: "#202223" }}>{customer.address || "—"}</td>
                        )}
                        {isColumnVisible("city") && (
                          <td style={{ padding: "12px 16px", color: "#202223" }}>{customer.city || "—"}</td>
                        )}
                        {isColumnVisible("state") && (
                          <td style={{ padding: "12px 16px", color: "#202223" }}>{customer.state || "—"}</td>
                        )}
                        {isColumnVisible("country") && (
                          <td style={{ padding: "12px 16px", color: "#202223" }}>{customer.country || "—"}</td>
                        )}
                        {isColumnVisible("zipCode") && (
                          <td style={{ padding: "12px 16px", color: "#202223" }}>{customer.zipCode || "—"}</td>
                        )}
                        {isColumnVisible("status") && (
                          <td style={{ padding: "12px 16px", color: "#202223" }}>
                            <span
                              style={{
                                padding: "4px 8px",
                                borderRadius: "4px",
                                fontSize: "12px",
                                backgroundColor:
                                  customer.status === "approved"
                                    ? "#e3fcef"
                                    : customer.status === "rejected"
                                    ? "#fee"
                                    : "#fff4e6",
                                color:
                                  customer.status === "approved"
                                    ? "#006644"
                                    : customer.status === "rejected"
                                    ? "#c33"
                                    : "#b98900",
                                textTransform: "capitalize",
                              }}
                            >
                              {customer.status}
                            </span>
                          </td>
                        )}
                        {isColumnVisible("orderCount") && (
                          <td style={{ padding: "12px 16px", color: "#202223" }}>{customer.orderCount || 0}</td>
                        )}
                        {isColumnVisible("totalSpent") && (
                          <td style={{ padding: "12px 16px", color: "#202223" }}>
                            {formatCurrency(customer.totalSpent || 0, customer.currencyCode)}
                          </td>
                        )}
                        {isColumnVisible("currency") && (
                          <td style={{ padding: "12px 16px", color: "#202223" }}>
                            {customer.currencyCode || "USD"}
                          </td>
                        )}
                        {isColumnVisible("shopifyCustomerId") && (
                          <td style={{ padding: "12px 16px", color: "#202223" }}>{customer.shopifyCustomerId || "—"}</td>
                        )}
                        {isColumnVisible("notes") && (
                          <td
                            style={{
                              padding: "12px 16px",
                              color: "#202223",
                              maxWidth: "200px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {customer.notes || "—"}
                          </td>
                        )}
                        {status === "pending" && isColumnVisible("actions") && (
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ display: "flex", gap: "8px" }}>
                              <s-button size="small" variant="primary" onClick={() => handleApprove(customer.id)} disabled={isLoading}>
                                Approve
                              </s-button>
                              <s-button
                                size="small"
                                variant="critical"
                                onClick={() => handleReject(customer.id)}
                                disabled={isLoading}
                              >
                                Reject
                              </s-button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </s-box>
          </s-section>
        )}
      </s-page>
    </>
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
    "Orders Count",
    "Total Spent",
    "Currency",
    "Shopify Customer ID",
    "Notes",
    "Created At",
    "Approved At",
    "Rejected At",
  ];

  const escapeCSV = (value) => {
    if (value === null || value === undefined) return "";
    const stringValue = String(value);
    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  const formatDate = (date) => {
    if (!date) return "";
    return new Date(date).toISOString();
  };

  const rows = customers.map((customer) => [
    escapeCSV(customer.firstName),
    escapeCSV(customer.lastName),
    escapeCSV(customer.email),
    escapeCSV(customer.phone),
    escapeCSV(customer.company),
    escapeCSV(customer.address),
    escapeCSV(customer.city),
    escapeCSV(customer.state),
    escapeCSV(customer.country),
    escapeCSV(customer.zipCode),
    escapeCSV(customer.status),
    escapeCSV(customer.orderCount || 0),
    escapeCSV(customer.totalSpent || 0),
    escapeCSV(customer.currencyCode || "USD"),
    escapeCSV(customer.shopifyCustomerId),
    escapeCSV(customer.notes),
    escapeCSV(formatDate(customer.createdAt)),
    escapeCSV(formatDate(customer.approvedAt)),
    escapeCSV(formatDate(customer.rejectedAt)),
  ]);

  const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");

  return csvContent;
}

function downloadCSV(csvContent, filename) {
  // Add BOM for UTF-8 to support Excel
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};  