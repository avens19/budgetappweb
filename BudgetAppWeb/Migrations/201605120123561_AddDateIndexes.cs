namespace BudgetAppWeb.Migrations
{
    using System;
    using System.Data.Entity.Migrations;
    
    public partial class AddDateIndexes : DbMigration
    {
        public override void Up()
        {
            AlterColumn("dbo.Budgets", "DateCreated", c => c.DateTime(nullable: false));
            AlterColumn("dbo.Budgets", "DateUpdated", c => c.DateTime(nullable: false));
            CreateIndex("dbo.Budgets", "DateCreated");
            CreateIndex("dbo.Budgets", "DateUpdated");
            CreateIndex("dbo.Categories", "DateCreated");
            CreateIndex("dbo.Categories", "DateUpdated");
            CreateIndex("dbo.Expenses", "DateCreated");
            CreateIndex("dbo.Expenses", "DateUpdated");
        }
        
        public override void Down()
        {
            DropIndex("dbo.Expenses", new[] { "DateUpdated" });
            DropIndex("dbo.Expenses", new[] { "DateCreated" });
            DropIndex("dbo.Categories", new[] { "DateUpdated" });
            DropIndex("dbo.Categories", new[] { "DateCreated" });
            DropIndex("dbo.Budgets", new[] { "DateUpdated" });
            DropIndex("dbo.Budgets", new[] { "DateCreated" });
            AlterColumn("dbo.Budgets", "DateUpdated", c => c.DateTime(nullable: false));
            AlterColumn("dbo.Budgets", "DateCreated", c => c.DateTime(nullable: false));
        }
    }
}
