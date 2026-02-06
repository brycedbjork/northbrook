/**
 * Audit screen — query and browse the audit log.
 */

import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { Panel } from "../components/panel.js";
import { Table, type Column } from "../components/table.js";
import { useBroker } from "../hooks/use-broker.js";
import { colors } from "../lib/theme.js";
import { shortTime, truncate } from "../lib/format.js";
import type { AuditCommandsRow } from "@northbrook/broker-sdk-typescript";

const columns: Column<AuditCommandsRow>[] = [
  { header: "Time", width: 12, render: (r) => shortTime(r.timestamp) },
  { header: "Source", width: 10, render: (r) => r.source },
  { header: "Command", width: 20, render: (r) => r.command },
  { header: "Args", width: 30, render: (r) => truncate(r.arguments, 28) },
  {
    header: "Result",
    width: 8,
    align: "right",
    render: (r) => String(r.result_code),
    color: (r) => (r.result_code === 0 ? colors.green : colors.red),
  },
];

export function AuditScreen() {
  const { client } = useBroker();
  const [commands, setCommands] = useState<AuditCommandsRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!client) return;
    client
      .auditCommands()
      .then((res) => {
        setCommands(res.commands);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [client]);

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Panel title="Audit Log — Commands">
        {loading ? (
          <Text color={colors.textDim}>Loading audit log...</Text>
        ) : (
          <Table columns={columns} rows={commands} emptyMessage="No audit entries" maxRows={25} />
        )}
      </Panel>
    </Box>
  );
}
