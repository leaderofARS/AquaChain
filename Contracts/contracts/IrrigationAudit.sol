// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IrrigationAudit - Minimal auditable log for irrigation events
/// @notice Emits an event with a dataHash and zone so off-chain systems can index and verify
contract IrrigationAudit {
    /// @notice Emitted whenever an irrigation-related snapshot is anchored
    /// @param dataHash keccak256 hash of the JSON snapshot (indexed for quick lookup)
    /// @param zone logical zone identifier (e.g., "zone-A")
    /// @param ts block timestamp when anchored
    /// @param actor the msg.sender that called log
    event Log(bytes32 indexed dataHash, string zone, uint256 ts, address actor);

    /// @notice Anchor an event hash on-chain
    /// @param dataHash keccak256 hash of snapshot JSON
    /// @param zone zone identifier string
    function log(bytes32 dataHash, string calldata zone) external {
        emit Log(dataHash, zone, block.timestamp, msg.sender);
    }
}
