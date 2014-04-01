namespace BudgetAppWeb.Migrations
{
    using System;
    using System.Data.Entity.Migrations;
    
    public partial class AddCategories : DbMigration
    {
        public override void Up()
        {
            CreateTable(
                "dbo.Categories",
                c => new
                    {
                        Id = c.Long(nullable: false, identity: true),
                        Name = c.String(nullable: false),
                        BudgetId = c.String(nullable: false, maxLength: 128),
                        DateCreated = c.DateTime(nullable: false, defaultValueSql: "GETUTCDATE()"),
                        DateUpdated = c.DateTime(nullable: false, defaultValueSql: "GETUTCDATE()"),
                    })
                .PrimaryKey(t => t.Id)
                .ForeignKey("dbo.Budgets", t => t.BudgetId)
                .Index(t => t.BudgetId);
            
            RenameColumn("dbo.Budgets", "CreatedDate", "DateCreated");
            AddColumn("dbo.Expenses", "CategoryId", c => c.Long());
            AlterColumn("dbo.Budgets", "DateCreated", c => c.DateTime(nullable: false, defaultValueSql: "GETUTCDATE()"));
            AlterColumn("dbo.Budgets", "DateUpdated", c => c.DateTime(nullable: false, defaultValueSql: "GETUTCDATE()"));
            AlterColumn("dbo.Expenses", "DateCreated", c => c.DateTime(nullable: false, defaultValueSql: "GETUTCDATE()"));
            AlterColumn("dbo.Expenses", "DateUpdated", c => c.DateTime(nullable: false, defaultValueSql: "GETUTCDATE()"));
            CreateIndex("dbo.Expenses", "CategoryId");
            AddForeignKey("dbo.Expenses", "CategoryId", "dbo.Categories", "Id");
        }
        
        public override void Down()
        {
            RenameColumn("dbo.Budgets", "DateCreated", "CreatedDate");
            DropForeignKey("dbo.Expenses", "CategoryId", "dbo.Categories");
            DropForeignKey("dbo.Categories", "BudgetId", "dbo.Budgets");
            DropIndex("dbo.Categories", new[] { "BudgetId" });
            DropIndex("dbo.Expenses", new[] { "CategoryId" });
            DropColumn("dbo.Expenses", "CategoryId");
            DropTable("dbo.Categories");
        }
    }
}
