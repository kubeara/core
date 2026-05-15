import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule);
    const configService = app.get(ConfigService);
    const port = Number(configService.get<string>('PORT', '3000'));

    // Enable CORS for websocket communication with agent
    app.enableCors({
        origin: '*',
    });

    await app.listen(port);

    console.log(`[Control Panel App] Server running on port ${port}`);
}

void bootstrap();
