import { useFetcher, useRouteError } from "react-router";
import { useEffect } from "react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { useAppBridge } from "@shopify/app-bridge-react";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }) => {
  await authenticate.admin(request);
  
  const formData = await request.formData();
  
  const data = {
    firstName: formData.get("firstName")?.toString() || "",
    lastName: formData.get("lastName")?.toString() || "",
    email: formData.get("email")?.toString() || "",
    phone: formData.get("phone")?.toString() || "",
    company: formData.get("company")?.toString() || "",
    address: formData.get("address")?.toString() || "",
    city: formData.get("city")?.toString() || "",
    state: formData.get("state")?.toString() || "",
    country: formData.get("country")?.toString() || "",
    zipCode: formData.get("zipCode")?.toString() || "",
    notes: formData.get("notes")?.toString() || "",
  };

  // Validation
  if (!data.firstName || !data.lastName || !data.email) {
    return {
      error: "First name, last name, and email are required",
      success: false,
    };
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    return {
      error: "Please enter a valid email address",
      success: false,
    };
  }

  try {
    // Validate Prisma Client
    if (!prisma || typeof prisma.customer === "undefined") {
      console.error("Prisma Client not properly initialized.");
      return {
        error: "Database error. Please contact support.",
        success: false,
      };
    }

    // Check if email already exists
    const existingCustomer = await prisma.customer.findUnique({
      where: { email: data.email },
    });

    if (existingCustomer) {
      return {
        error: "This email is already registered",
        success: false,
      };
    }

    // Create customer with pending status
    await prisma.customer.create({
      data: {
        ...data,
        status: "pending",
      },
    });

    return {
      success: true,
      message: "Registration submitted successfully! The customer will be reviewed by the admin team.",
    };
  } catch (error) {
    console.error("Registration error:", error);
    return {
      error: "An error occurred. Please try again later.",
      success: false,
    };
  }
};

export default function Register() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const isLoading = fetcher.state === "submitting" || fetcher.state === "loading";
  const isSuccess = fetcher.data?.success === true;
  const error = fetcher.data?.error;

  useEffect(() => {
    if (isSuccess && fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message);
    } else if (error) {
      shopify.toast.show(error, { isError: true });
    }
  }, [isSuccess, error, fetcher.data, shopify]);

  return (
    <s-page heading="Customer Registration">
      <s-section>
        {isSuccess ? (
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="success-subdued"
            borderColor="success"
          >
            <s-stack direction="block" gap="small">
              <s-text variant="headingMd" tone="success">
                Registration Successful!
              </s-text>
              <s-text>
                {fetcher.data?.message}
              </s-text>
              <s-button
                onClick={() => {
                  fetcher.submit({}, { method: "GET" });
                  window.location.reload();
                }}
                variant="secondary"
              >
                Register Another Customer
              </s-button>
            </s-stack>
          </s-box>
        ) : (
          <fetcher.Form method="post">
            <s-stack direction="block" gap="base">
              {error && (
                <s-banner tone="critical">
                  {error}
                </s-banner>
              )}

              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="base"
              >
                <s-stack direction="block" gap="base">
                  <s-heading level="3">Personal Information</s-heading>
                  
                  <s-stack direction="inline" gap="base">
                    <s-stack direction="block" gap="small" style={{ flex: 1 }}>
                      <label htmlFor="firstName">
                        <s-text variant="bodyMd" fontWeight="semibold">
                          First Name <s-text tone="critical">*</s-text>
                        </s-text>
                      </label>
                      <input
                        type="text"
                        id="firstName"
                        name="firstName"
                        required
                        disabled={isLoading}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "1px solid #e1e3e5",
                          borderRadius: "6px",
                          fontSize: "14px",
                        }}
                      />
                    </s-stack>

                    <s-stack direction="block" gap="small" style={{ flex: 1 }}>
                      <label htmlFor="lastName">
                        <s-text variant="bodyMd" fontWeight="semibold">
                          Last Name <s-text tone="critical">*</s-text>
                        </s-text>
                      </label>
                      <input
                        type="text"
                        id="lastName"
                        name="lastName"
                        required
                        disabled={isLoading}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "1px solid #e1e3e5",
                          borderRadius: "6px",
                          fontSize: "14px",
                        }}
                      />
                    </s-stack>
                  </s-stack>

                  <s-stack direction="block" gap="small">
                    <label htmlFor="email">
                      <s-text variant="bodyMd" fontWeight="semibold">
                        Email <s-text tone="critical">*</s-text>
                      </s-text>
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      required
                      disabled={isLoading}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid #e1e3e5",
                        borderRadius: "6px",
                        fontSize: "14px",
                      }}
                    />
                  </s-stack>

                  <s-stack direction="block" gap="small">
                    <label htmlFor="phone">
                      <s-text variant="bodyMd" fontWeight="semibold">Phone</s-text>
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      disabled={isLoading}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid #e1e3e5",
                        borderRadius: "6px",
                        fontSize: "14px",
                      }}
                    />
                  </s-stack>

                  <s-stack direction="block" gap="small">
                    <label htmlFor="company">
                      <s-text variant="bodyMd" fontWeight="semibold">Company</s-text>
                    </label>
                    <input
                      type="text"
                      id="company"
                      name="company"
                      disabled={isLoading}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid #e1e3e5",
                        borderRadius: "6px",
                        fontSize: "14px",
                      }}
                    />
                  </s-stack>
                </s-stack>
              </s-box>

              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="base"
              >
                <s-stack direction="block" gap="base">
                  <s-heading level="3">Address Information</s-heading>

                  <s-stack direction="block" gap="small">
                    <label htmlFor="address">
                      <s-text variant="bodyMd" fontWeight="semibold">Address</s-text>
                    </label>
                    <input
                      type="text"
                      id="address"
                      name="address"
                      disabled={isLoading}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        border: "1px solid #e1e3e5",
                        borderRadius: "6px",
                        fontSize: "14px",
                      }}
                    />
                  </s-stack>

                  <s-stack direction="inline" gap="base">
                    <s-stack direction="block" gap="small" style={{ flex: 1 }}>
                      <label htmlFor="city">
                        <s-text variant="bodyMd" fontWeight="semibold">City</s-text>
                      </label>
                      <input
                        type="text"
                        id="city"
                        name="city"
                        disabled={isLoading}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "1px solid #e1e3e5",
                          borderRadius: "6px",
                          fontSize: "14px",
                        }}
                      />
                    </s-stack>

                    <s-stack direction="block" gap="small" style={{ flex: 1 }}>
                      <label htmlFor="state">
                        <s-text variant="bodyMd" fontWeight="semibold">State/Province</s-text>
                      </label>
                      <input
                        type="text"
                        id="state"
                        name="state"
                        disabled={isLoading}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "1px solid #e1e3e5",
                          borderRadius: "6px",
                          fontSize: "14px",
                        }}
                      />
                    </s-stack>
                  </s-stack>

                  <s-stack direction="inline" gap="base">
                    <s-stack direction="block" gap="small" style={{ flex: 1 }}>
                      <label htmlFor="country">
                        <s-text variant="bodyMd" fontWeight="semibold">Country</s-text>
                      </label>
                      <input
                        type="text"
                        id="country"
                        name="country"
                        disabled={isLoading}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "1px solid #e1e3e5",
                          borderRadius: "6px",
                          fontSize: "14px",
                        }}
                      />
                    </s-stack>

                    <s-stack direction="block" gap="small" style={{ flex: 1 }}>
                      <label htmlFor="zipCode">
                        <s-text variant="bodyMd" fontWeight="semibold">Zip/Postal Code</s-text>
                      </label>
                      <input
                        type="text"
                        id="zipCode"
                        name="zipCode"
                        disabled={isLoading}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          border: "1px solid #e1e3e5",
                          borderRadius: "6px",
                          fontSize: "14px",
                        }}
                      />
                    </s-stack>
                  </s-stack>
                </s-stack>
              </s-box>

              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
                background="base"
              >
                <s-stack direction="block" gap="small">
                  <label htmlFor="notes">
                    <s-text variant="bodyMd" fontWeight="semibold">Additional Notes</s-text>
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    rows="4"
                    disabled={isLoading}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #e1e3e5",
                      borderRadius: "6px",
                      fontSize: "14px",
                      fontFamily: "inherit",
                      resize: "vertical",
                    }}
                  />
                </s-stack>
              </s-box>

              <s-stack direction="inline" gap="base">
                <s-button
                  type="submit"
                  variant="primary"
                  disabled={isLoading}
                  loading={isLoading}
                >
                  {isLoading ? "Submitting..." : "Submit Registration"}
                </s-button>
                <s-button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    window.location.href = "/app/customers";
                  }}
                >
                  View Customers
                </s-button>
              </s-stack>
            </s-stack>
          </fetcher.Form>
        )}
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

