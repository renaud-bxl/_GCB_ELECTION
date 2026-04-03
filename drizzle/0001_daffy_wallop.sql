CREATE TABLE `agenda_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`category` varchar(64) NOT NULL DEFAULT 'Réunion',
	`date` timestamp NOT NULL,
	`time` varchar(10) NOT NULL DEFAULT '19h00',
	`location` varchar(255),
	`isPublished` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agenda_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `program_points` (
	`id` int AUTO_INCREMENT NOT NULL,
	`number` varchar(4) NOT NULL,
	`title` varchar(255) NOT NULL,
	`subtitle` varchar(255),
	`frontText` text NOT NULL,
	`backText` text NOT NULL,
	`isPublished` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `program_points_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `social_shares` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`imageUrl` text NOT NULL,
	`textFacebook` text NOT NULL,
	`textX` text NOT NULL,
	`textLinkedin` text NOT NULL,
	`hashtags` varchar(255) DEFAULT '#MR #Bruxelles #Geoffroy',
	`isPublished` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `social_shares_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `support_submissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`prenom` varchar(100) NOT NULL,
	`nom` varchar(100) NOT NULL,
	`email` varchar(320) NOT NULL,
	`telephone` varchar(30),
	`commune` varchar(100) NOT NULL,
	`message` text,
	`supportType` varchar(64) DEFAULT 'contact',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `support_submissions_id` PRIMARY KEY(`id`)
);
