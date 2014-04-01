namespace BudgetAppWeb.Migrations
{
    using System;
    using System.Data.Entity.Migrations;
    
    public partial class AddUpdated : DbMigration
    {
        public override void Up()
        {
            AddColumn("dbo.Budgets", "DateUpdated", n => n.DateTime(nullable: true, defaultValueSql: "GETDATE()"));
            AddColumn("dbo.Expenses", "DateUpdated", n => n.DateTime(nullable: true, defaultValueSql: "GETDATE()"));
        }
        
        public override void Down()
        {
            DropColumn("dbo.Expenses", "DateUpdated");
            DropColumn("dbo.Budgets", "DateUpdated");
        }
    }
}
