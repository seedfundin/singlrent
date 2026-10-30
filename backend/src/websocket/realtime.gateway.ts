import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { JwtService } from "@nestjs/jwt";
import { PermissionKey, RoleCode } from "@prisma/client";
import { Server, Socket } from "socket.io";
import { JwtPayload } from "../common/types/authenticated-user";
import { PermissionsService } from "../permissions/permissions.service";
import { PrismaService } from "../common/database/prisma.service";

interface RealtimeSocketData {
  userId: string;
  email?: string;
  roles: RoleCode[];
  permissions: PermissionKey[];
}

type RealtimeSocket = Socket & { data: RealtimeSocketData };

@WebSocketGateway({
  namespace: "/realtime",
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly permissionsService: PermissionsService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const socket = client as RealtimeSocket;
    try {
      this.assertAllowedOrigin(socket);
      const token = this.extractAccessToken(socket);
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>("JWT_ACCESS_SECRET"),
      });
      if (payload.tokenType !== "access") {
        throw new Error("Invalid token type");
      }
      const authorization =
        await this.permissionsService.getAuthorizationContext(payload.sub);

      socket.data = {
        userId: payload.sub,
        email: payload.email,
        roles: authorization.roles,
        permissions: authorization.permissions,
      };
      await socket.join(`user:${payload.sub}`);
      await socket.join(authorization.roles.map((role) => `role:${role}`));
      const memberships = await this.prisma.conversationMember.findMany({
        where: { userId: payload.sub },
        select: { conversationId: true },
      });
      await socket.join(
        memberships.map(
          (membership) => `conversation:${membership.conversationId}`,
        ),
      );
      socket.emit("presence:connected", {
        userId: payload.sub,
        at: new Date().toISOString(),
      });
    } catch (error: unknown) {
      this.logger.warn(
        `Rejected socket connection: ${error instanceof Error ? error.message : "unknown error"}`,
      );
      socket.emit("connection:error", { message: "Authentication failed" });
      socket.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const socket = client as RealtimeSocket;
    if (socket.data?.userId) {
      this.server.to(`user:${socket.data.userId}`).emit("presence:offline", {
        userId: socket.data.userId,
        at: new Date().toISOString(),
      });
    }
  }

  @SubscribeMessage("presence:heartbeat")
  heartbeat(@ConnectedSocket() client: Socket): void {
    const socket = client as RealtimeSocket;
    socket.emit("presence:alive", { at: new Date().toISOString() });
  }

  @SubscribeMessage("conversation:typing")
  typing(
    @ConnectedSocket() client: Socket,
    payload: { conversationId?: string; isTyping?: boolean },
  ): void {
    const socket = client as RealtimeSocket;
    if (!payload.conversationId || payload.conversationId.length > 128) {
      return;
    }
    if (!socket.rooms.has(`conversation:${payload.conversationId}`)) {
      return;
    }
    socket
      .to(`conversation:${payload.conversationId}`)
      .emit("conversation:typing", {
        conversationId: payload.conversationId,
        userId: socket.data.userId,
        isTyping: Boolean(payload.isTyping),
      });
  }

  emitNotification(
    userId: string,
    notification: Record<string, unknown>,
  ): void {
    this.server.to(`user:${userId}`).emit("notification:created", notification);
  }

  joinUserToConversation(userId: string, conversationId: string): void {
    this.server
      .in(`user:${userId}`)
      .socketsJoin(`conversation:${conversationId}`);
  }

  joinUserToProperty(userId: string, listingId: string): void {
    this.server.in(`user:${userId}`).socketsJoin(`property:${listingId}`);
  }

  emitMessage(conversationId: string, message: Record<string, unknown>): void {
    this.server
      .to(`conversation:${conversationId}`)
      .emit("message:created", message);
  }

  emitMaintenanceUpdate(
    propertyId: string,
    update: Record<string, unknown>,
  ): void {
    this.server
      .to(`property:${propertyId}`)
      .emit("maintenance:updated", update);
  }

  emitPaymentUpdate(userId: string, update: Record<string, unknown>): void {
    this.server.to(`user:${userId}`).emit("payment:updated", update);
  }

  private extractAccessToken(socket: Socket): string {
    const handshakeToken = socket.handshake.auth.token;
    if (typeof handshakeToken === "string" && handshakeToken.length > 0) {
      return handshakeToken;
    }
    const authorization = socket.handshake.headers.authorization;
    if (
      typeof authorization === "string" &&
      authorization.startsWith("Bearer ")
    ) {
      return authorization.slice("Bearer ".length);
    }
    throw new Error("Missing access token");
  }

  private assertAllowedOrigin(socket: Socket): void {
    const origin = socket.handshake.headers.origin;
    const origins = this.configService
      .getOrThrow<string>("CORS_ORIGIN")
      .split(",")
      .map((value) => value.trim());
    if (origin && !origins.includes(origin)) {
      throw new Error("Origin is not allowed");
    }
  }
}
