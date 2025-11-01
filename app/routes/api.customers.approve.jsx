import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// POST /api/customers/approve - Approve customer and create in Shopify
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const customerId = body.customerId;
    const notes = body.notes || "";

    if (!customerId) {
      return Response.json(
        { error: "Customer ID is required" },
        { status: 400 }
      );
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return Response.json({ error: "Customer not found" }, { status: 404 });
    }

    if (customer.status === "approved") {
      return Response.json(
        { error: "Customer is already approved" },
        { status: 400 }
      );
    }

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
            note: notes || customer.notes || undefined,
          },
        },
      }
    );

    const shopifyResponse = await shopifyCustomerResponse.json();

    if (shopifyResponse.data.customerCreate.userErrors?.length > 0) {
      return Response.json(
        {
          error:
            shopifyResponse.data.customerCreate.userErrors[0].message ||
            "Failed to create customer in Shopify",
        },
        { status: 400 }
      );
    }

    // Extract customer ID from GID format
    const shopifyCustomerGid =
      shopifyResponse.data.customerCreate.customer?.id;
    const shopifyCustomerId = shopifyCustomerGid
      ? shopifyCustomerGid.split("/").pop()
      : null;

    // Update customer status
    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data: {
        status: "approved",
        shopifyCustomerId: shopifyCustomerId || null,
        approvedAt: new Date(),
        approvedBy: session.shop,
        notes: notes || customer.notes,
      },
    });

    return Response.json({
      customer: updatedCustomer,
      shopifyCustomer: shopifyResponse.data.customerCreate.customer,
      success: true,
      message: "Customer approved and created in Shopify successfully",
    });
  } catch (error) {
    console.error("Approve customer error:", error);
    return Response.json(
      { error: "Failed to approve customer", details: error.message },
      { status: 500 }
    );
  }
};
