import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true,
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Crash Game Game Service")
    .setDescription("Round, bet and realtime API for Crash Game.")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, swaggerDocument);

  const port = process.env.PORT ?? "4001";
  await app.listen(port, "0.0.0.0");
  console.log(`Games service running on port ${port}`);
}

bootstrap();
