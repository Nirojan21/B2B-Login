import { useFetcher } from "react-router";
import { useEffect } from "react";
import prisma from "../db.server";

export const loader = async () => {
  return null;
};

export const action = async ({ request }) => {
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
      message: "Registration submitted successfully! Your account will be reviewed by our team.",
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
  const isLoading = fetcher.state === "submitting" || fetcher.state === "loading";
  const isSuccess = fetcher.data?.success === true;
  const error = fetcher.data?.error;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Customer Registration</title>
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <style>{`
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 600px;
            width: 100%;
            padding: 40px;
          }
          h1 {
            color: #333;
            margin-bottom: 30px;
            text-align: center;
            font-size: 28px;
          }
          .form-group {
            margin-bottom: 20px;
          }
          label {
            display: block;
            margin-bottom: 8px;
            color: #555;
            font-weight: 500;
            font-size: 14px;
          }
          input, textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 6px;
            font-size: 14px;
            transition: border-color 0.3s;
          }
          input:focus, textarea:focus {
            outline: none;
            border-color: #667eea;
          }
          .required {
            color: #e74c3c;
          }
          button {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
          }
          button:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
          }
          button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
          .error {
            background: #fee;
            color: #c33;
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 20px;
            border-left: 4px solid #c33;
          }
          .success {
            background: #efe;
            color: #3c3;
            padding: 20px;
            border-radius: 6px;
            margin-bottom: 20px;
            text-align: center;
            border-left: 4px solid #3c3;
          }
          .row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
          }
          @media (max-width: 600px) {
            .row {
              grid-template-columns: 1fr;
            }
            .container {
              padding: 20px;
            }
          }
        `}</style>
      </head>
      <body>
        <div className="container">
          <h1>Customer Registration</h1>
          
          {isSuccess ? (
            <div className="success">
              <p>{fetcher.data?.message}</p>
            </div>
          ) : (
            <fetcher.Form method="post">
              {error && (
                <div className="error">
                  {error}
                </div>
              )}
              
              <div className="row">
                <div className="form-group">
                  <label htmlFor="firstName">
                    First Name <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    name="firstName"
                    required
                    disabled={isLoading}
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="lastName">
                    Last Name <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    name="lastName"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="email">
                  Email <span className="required">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="phone">Phone</label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  disabled={isLoading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="company">Company</label>
                <input
                  type="text"
                  id="company"
                  name="company"
                  disabled={isLoading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="address">Address</label>
                <input
                  type="text"
                  id="address"
                  name="address"
                  disabled={isLoading}
                />
              </div>

              <div className="row">
                <div className="form-group">
                  <label htmlFor="city">City</label>
                  <input
                    type="text"
                    id="city"
                    name="city"
                    disabled={isLoading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="state">State</label>
                  <input
                    type="text"
                    id="state"
                    name="state"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="row">
                <div className="form-group">
                  <label htmlFor="country">Country</label>
                  <input
                    type="text"
                    id="country"
                    name="country"
                    disabled={isLoading}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="zipCode">Zip Code</label>
                  <input
                    type="text"
                    id="zipCode"
                    name="zipCode"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="notes">Additional Notes</label>
                <textarea
                  id="notes"
                  name="notes"
                  rows="3"
                  disabled={isLoading}
                />
              </div>

              <button type="submit" disabled={isLoading}>
                {isLoading ? "Submitting..." : "Submit Registration"}
              </button>
            </fetcher.Form>
          )}
        </div>
      </body>
    </html>
  );
}
