import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const spec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "MES Lite API",
      version: "0.1.0"
    },
    servers: [{ url: "/api" }]
  },
  apis: ["./src/modules/**/*.routes.js"]
});

export function mountSwagger(app) {
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(spec));
}
