CREATE TABLE `deposits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timeDepositId` integer NOT NULL,
	`amount` real NOT NULL,
	`date` integer NOT NULL,
	FOREIGN KEY (`timeDepositId`) REFERENCES `timeDeposits`(`id`) ON UPDATE no action ON DELETE cascade
);
