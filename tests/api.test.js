const request = require("supertest");
const app = require("../server");
const mongoose = require("mongoose");

/**
 * API Endpoints Tests
 * Focus: High Coverage & Reliability
 */
describe("Kira API Unit Tests", () => {

    // Close DB connection after all tests
    afterAll(async () => {
        await mongoose.connection.close();
    });

    describe("System Health", () => {
        it("GET / should return survival message", async () => {
            const res = await request(app).get("/");
            expect(res.statusCode).toBe(200);
            expect(res.body.message).toContain("Kira Task Manager API is running");
        });
    });

    describe("Authentication Endpoints", () => {
        it("POST /api/auth/login - should validate missing fields (400)", async () => {
            const res = await request(app)
                .post("/api/auth/login")
                .send({ email: "test@example.com" }); // Missing password
            expect([400, 422]).toContain(res.statusCode);
            expect(res.body).toHaveProperty("message");
        });

        it("POST /api/auth/login - should fail with invalid credentials", async () => {
            const res = await request(app)
                .post("/api/auth/login")
                .send({ email: "nonexistent@kira.com", password: "wrongpassword123" });
            expect(res.statusCode).toBe(401);
        });

        it("POST /api/auth/signup - should prevent duplicate email registration", async () => {
            // This assumes 'test@example.com' might exist if tests run against a real DB
            // In a real mock, we would use jest.mocking for the User model
            const res = await request(app)
                .post("/api/auth/signup")
                .send({
                    fullName: "Test User",
                    email: "admin@kira.com", // Likely exists
                    password: "password123"
                });
            expect(res.statusCode).toBe(400);
        });
    });

    describe("Protected Resource Access (RBAC)", () => {
        it("GET /api/tasks/my - should return 401 for unauthorized requests", async () => {
            const res = await request(app).get("/api/tasks/my");
            expect(res.statusCode).toBe(401);
        });

        it("GET /api/users/me - should return 401 for unauthorized requests", async () => {
            const res = await request(app).get("/api/auth/me");
            expect(res.statusCode).toBe(401);
        });
    });

    describe("Input Validation & Edge Cases", () => {
        it("POST /api/auth/signup - should fail with short password", async () => {
            const res = await request(app)
                .post("/api/auth/signup")
                .send({
                    fullName: "Short Pass",
                    email: "short@pass.com",
                    password: "123"
                });
            expect(res.statusCode).toBe(400);
        });

        it("Verify 404 for non-existent routes", async () => {
            const res = await request(app).get("/api/ghost-route");
            expect(res.statusCode).toBe(404);
        });
    });
});
