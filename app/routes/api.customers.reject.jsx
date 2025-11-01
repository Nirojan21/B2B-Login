import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// POST /api/customers/reject - Reject customer registration
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);

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

    if (customer.status === "rejected") {
      return Response.json(
        { error: "Customer is already rejected" },
        { status: 400 }
      );
    }

    // Update customer status
    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data: {
        status: "rejected",
        rejectedAt: new Date(),
        approvedBy: session.shop,
        notes: notes || customer.notes,
      },
    });

    return Response.json({
      customer: updatedCustomer,
      success: true,
      message: "Customer registration rejected",
    });
  } catch (error) {
    console.error("Reject customer error:", error);
    return Response.json(
      { error: "Failed to reject customer", details: error.message },
      { status: 500 }
    );
  }
};
