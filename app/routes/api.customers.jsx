import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// GET /api/customers - List all customers with filters
export const loader = async ({ request }) => {
  await authenticate.admin(request);
  
  // Check if prisma is properly initialized
  if (!prisma || !prisma.customer) {
    console.error("Prisma client not initialized. Customer model not available.");
    return Response.json(
      { 
        error: "Database not initialized. Please restart the server after running: npx prisma generate",
        details: "Prisma Client needs to be regenerated"
      },
      { status: 500 }
    );
  }
  
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("search");
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    const where = {};
    
    if (status && status !== "all") {
      where.status = status;
    }
    
    if (search) {
      // SQLite doesn't support case-insensitive mode, so we'll do case-insensitive filtering in memory or use contains
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { email: { contains: search } },
        { company: { contains: search } },
      ];
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.customer.count({ where }),
    ]);

    // Get statistics
    const [pendingCount, approvedCount, rejectedCount, totalCount] = await Promise.all([
      prisma.customer.count({ where: { status: "pending" } }),
      prisma.customer.count({ where: { status: "approved" } }),
      prisma.customer.count({ where: { status: "rejected" } }),
      prisma.customer.count(),
    ]);

    return Response.json({
      customers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      statistics: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        total: totalCount,
      },
    });
  } catch (error) {
    console.error("API Error:", error);
    return Response.json(
      { 
        error: "Failed to fetch customers",
        details: error.message,
        hint: "Make sure Prisma Client is generated (npx prisma generate)"
      },
      { status: 500 }
    );
  }
};

// POST /api/customers - Create new customer
export const action = async ({ request }) => {
  await authenticate.admin(request);
  
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    
    const data = {
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      phone: body.phone || null,
      company: body.company || null,
      address: body.address || null,
      city: body.city || null,
      state: body.state || null,
      country: body.country || null,
      zipCode: body.zipCode || null,
      notes: body.notes || null,
      status: body.status || "pending",
    };

    // Validation
    if (!data.firstName || !data.lastName || !data.email) {
      return Response.json(
        { error: "First name, last name, and email are required" },
        { status: 400 }
      );
    }

    // Check if email exists
    const existing = await prisma.customer.findUnique({
      where: { email: data.email },
    });

    if (existing) {
      return Response.json(
        { error: "Customer with this email already exists" },
        { status: 409 }
      );
    }

    const customer = await prisma.customer.create({ data });

    return Response.json({ customer, success: true }, { status: 201 });
  } catch (error) {
    console.error("Create customer error:", error);
    return Response.json(
      { error: "Failed to create customer", details: error.message },
      { status: 500 }
    );
  }
};
