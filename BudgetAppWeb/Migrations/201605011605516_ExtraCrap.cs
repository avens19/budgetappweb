namespace BudgetAppWeb.Migrations
{
    using System;
    using System.Data.Entity.Migrations;
    
    public partial class ExtraCrap : DbMigration
    {
        public override void Up()
        {
            DropForeignKey("dbo.Categories", "BudgetId", "dbo.Budgets");
            DropIndex("dbo.Categories", new[] { "BudgetId" });
            AlterColumn("dbo.Categories", "Name", c => c.String(nullable: false));
            AlterColumn("dbo.Categories", "BudgetId", c => c.String(nullable: false, maxLength: 128));
            CreateIndex("dbo.Categories", "BudgetId");
            AddForeignKey("dbo.Categories", "BudgetId", "dbo.Budgets", "UniqueId", cascadeDelete: true);
        }
        
        public override void Down()
        {
            DropForeignKey("dbo.Categories", "BudgetId", "dbo.Budgets");
            DropIndex("dbo.Categories", new[] { "BudgetId" });
            AlterColumn("dbo.Categories", "BudgetId", c => c.String(maxLength: 128));
            AlterColumn("dbo.Categories", "Name", c => c.String());
            CreateIndex("dbo.Categories", "BudgetId");
            AddForeignKey("dbo.Categories", "BudgetId", "dbo.Budgets", "UniqueId");
        }
    }
}
