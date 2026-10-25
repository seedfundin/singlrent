CREATE TABLE "property_question_escalations" (
  "id" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "questionMessageId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "contactId" UUID NOT NULL,
  "question" TEXT NOT NULL,
  "response" TEXT,
  "assistantMessageId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  CONSTRAINT "property_question_escalations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "property_question_escalations_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "property_question_escalations_questionMessageId_fkey" FOREIGN KEY ("questionMessageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "property_question_escalations_assistantMessageId_fkey" FOREIGN KEY ("assistantMessageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "property_question_escalations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "property_question_escalations_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "property_question_escalations_questionMessageId_key" ON "property_question_escalations"("questionMessageId");
CREATE UNIQUE INDEX "property_question_escalations_assistantMessageId_key" ON "property_question_escalations"("assistantMessageId");
CREATE INDEX "property_question_escalations_contactId_respondedAt_createdAt_idx" ON "property_question_escalations"("contactId", "respondedAt", "createdAt");
CREATE INDEX "property_question_escalations_conversationId_createdAt_idx" ON "property_question_escalations"("conversationId", "createdAt");
