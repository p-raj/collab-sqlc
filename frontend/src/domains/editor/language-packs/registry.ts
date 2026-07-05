import type { DatabaseType } from "@/domains/connections/engine-registry";
import { dynamodbLanguagePack } from "./dynamodb-language-pack";
import { redisLanguagePack } from "./redis-language-pack";
import { sqlLanguagePack } from "./sql-language-pack";
import type { LanguagePack } from "./types";

export function getLanguagePack(dbType: DatabaseType | null | undefined): LanguagePack {
  if (dbType === "redis") {
    return redisLanguagePack;
  }
  if (dbType === "dynamodb") {
    return dynamodbLanguagePack;
  }
  return sqlLanguagePack;
}
