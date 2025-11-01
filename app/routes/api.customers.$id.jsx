import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// GET /api/customers/:id - Get single customer
export const loader = async ({ request, params }) => {
  await authenticate.admin(request);
  
  const { id } = params;

  try {
    const customer = await prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      return Response.json({ error: "Customer not found" }, { status: 404 });
    }

    return Response.json({ customer });
  } catch (error) {
    console.error("Get customer error:", error);
    return Response.json(
      { error: "Failed to fetch customer", details: error.message },
      { status: 500 }
    );
  }
};

// PUT /api/customers/:id - Update customer
// DELETE /api/customers/:id - Delete customer
export const action = async ({ request, params }) => {
  await authenticate.admin(request);
  
  const { id } = params;
  const method = request.method;

  try {
    if (method === "PUT") {
      const body = await request.json();

      // Check if customer exists
      const existing = await prisma.customer.findUnique({
        where: { id },
      });

      if (!existing) {
        return Response.json({ error: "Customer not found" }, { status: 404 });
      }

      // If email is being updated, check for duplicates
      if (body.email && body.email !== existing.email) {
        const emailExists = await prisma.customer.findUnique({
          where: { email: body.email },
        });
        if (emailExists) {
          return Response.json(
            { error: "Email already exists" },
            { status: 409 }
          );
        }
      }

      const updateData = {};
      const allowedFields = [
        "firstName",
        "lastName",
        "email",
        "phone",
        "company",
        "address",
        "city",
        "state",
        "country",
        "zipCode",
        "status",
        "notes",
      ];

      allowedFields.forEach((field) => {
        if (body[field] !== undefined) {
          updateData[field] = body[field] || null;
        }
      });

      // Update timestamps based on status change
      if (body.status === "approved" && existing.status !== "approved") {
        updateData.approvedAt = new Date();
      } else if (body.status === "rejected" && existing.status !== "rejected") {
        updateData.rejectedAt = new Date();
      }

      const customer = await prisma.customer.update({
        where: { id },
        data: updateData,
      });

      return Response.json({ customer, success: true });
    } else if (method === "DELETE") {
      const customer = await prisma.customer.findUnique({
        where: { id },
      });

      if (!customer) {
        return Response.json({ error: "Customer not found" }, { status: 404 });
      }

      await prisma.customer.delete({
        where: { id },
      });

      return Response.json({ success: true, message: "Customer deleted" });
    } else {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }
  } catch (error) {
    console.error("Customer action error:", error);
    return Response.json(
      { error: "Operation failed", details: error.message },
      { status: 500 }
    );
  }
};
